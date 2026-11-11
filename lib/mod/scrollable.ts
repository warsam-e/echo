import {
	ActionRowBuilder,
	type ActionRowData,
	type APIMessageTopLevelComponent,
	type Awaitable,
	ButtonBuilder,
	type ButtonInteraction,
	ButtonStyle,
	ComponentType,
	type InteractionCollector,
	type InteractionEditReplyOptions,
	type InteractionReplyOptions,
	type JSONEncodable,
	type Message,
	type MessageActionRowComponentBuilder,
	type MessageActionRowComponentData,
	MessageFlags,
	type RepliableInteraction,
	TextDisplayBuilder,
	type TopLevelComponentData,
} from 'discord.js';

// biome-ignore lint/suspicious/noExplicitAny: it's needed here
type ScrollableDataType = Array<Record<string, any>>;

export type ScrollableContent = {
	/** The Components V2 layout for the page. */
	components: Array<
		| JSONEncodable<APIMessageTopLevelComponent>
		| TopLevelComponentData
		| ActionRowData<MessageActionRowComponentData | MessageActionRowComponentBuilder>
		| APIMessageTopLevelComponent
	>;
	/** Files to upload with this page. */
	files?: NonNullable<InteractionReplyOptions['files']>;
};

export interface ScrollableData<Data extends ScrollableDataType> {
	/** The interaction whose reply will display the paginator. */
	int: RepliableInteraction;
	/**
	 * Show the page count on the buttons row
	 * @default true
	 */
	show_page_count?: boolean;
	/**
	 * The message to show when the first page cannot be loaded or sent.
	 * @default "Failed to get data."
	 */
	fail_msg?: ScrollableContent;
	/**
	 * The message shown without pagination controls when data returns an empty array.
	 * @default "No results."
	 */
	empty_msg?: ScrollableContent;
	/** Loads the list of items when the paginator opens or reloads. */
	data: () => Awaitable<Data>;
	/**
	 * Who can control the scrollable.
	 * @default 'initiator'
	 */
	controllable?: 'initiator' | 'all';
	/** Renders the current item and can load additional details for that page. */
	match: (val: Data[number], index: number, array: Array<Data[number]>) => Awaitable<ScrollableContent>;
}

const idleTimeout = 10 * 60 * 1000;
const tokenLifetime = 15 * 60 * 1000;
const tokenExpiryBuffer = 10_000;
const previousId = 'scrollable_prev';
const nextId = 'scrollable_next';
const reloadId = 'scrollable_reload';

type Page<Data extends ScrollableDataType> = {
	data: Data;
	index: number;
	content: ScrollableContent;
};

const sessions = new WeakMap<RepliableInteraction['client'], Map<string, () => Promise<void>>>();

/** Controls an active pagination session. */
export interface ScrollableHandle {
	/** Stops pagination and disables its controls, leaving the current page visible. */
	stop(): Promise<void>;
}

function pagePayload(page: ScrollableContent): InteractionEditReplyOptions {
	return {
		...page,
		content: null,
		embeds: [],
		attachments: [],
		flags: MessageFlags.IsComponentsV2,
	};
}

function emptyPayload(message?: ScrollableContent): InteractionEditReplyOptions {
	return pagePayload(message ?? { components: [new TextDisplayBuilder().setContent('No results.')] });
}

async function renderPage<Data extends ScrollableDataType>(options: ScrollableData<Data>, data: Data, index: number) {
	const item = data[index];
	if (item === undefined) throw new Error('Scrollable data has no page to display.');
	return { data, index, content: await options.match(item, index, data) };
}

/** The in-memory session created by {@link create_scrollable}. */
class Scrollable<Data extends ScrollableDataType> {
	readonly #options: ScrollableData<Data>;
	#page: Page<Data>;
	#latestInteraction: RepliableInteraction;
	#queue = Promise.resolve();
	#editing = Promise.resolve();
	#pending = 0;
	#disabled = false;
	#closed = false;
	#replaced = false;
	#collector?: InteractionCollector<ButtonInteraction>;
	#finished?: Promise<void>;

	private constructor(options: ScrollableData<Data>, page: Page<Data>) {
		this.#options = { ...options };
		this.#page = page;
		this.#latestInteraction = options.int;
	}

	static async init<Data extends ScrollableDataType>(
		options: ScrollableData<Data>,
	): Promise<ScrollableHandle | undefined> {
		const { int } = options;
		if (!int.deferred && !int.replied) await int.deferReply();
		const original = await int.fetchReply();
		const active = sessions.get(int.client) ?? new Map<string, () => Promise<void>>();
		sessions.set(int.client, active);
		const previous = active.get(original.id);
		const retiring = previous?.() ?? Promise.resolve();
		let cancelled = false;
		let listening = false;
		let session: Scrollable<Data> | undefined;
		let initialEdit: Promise<unknown> = Promise.resolve();
		const retire = async () => {
			cancelled = true;
			const stopped = session ? session.#stop() : Promise.resolve();
			await retiring;
			await initialEdit.catch(() => {});
			await stopped;
		};
		active.set(original.id, retire);
		const release = () => {
			if (active.get(original.id) === retire) active.delete(original.id);
		};

		try {
			await retiring;
			if (cancelled) return;
			const data = await options.data();
			if (cancelled) return;
			if (!data.length) {
				initialEdit = int.editReply(emptyPayload(options.empty_msg));
				await initialEdit;
				return;
			}
			const page = await renderPage(options, data, 0);
			if (cancelled) return;
			session = new Scrollable(options, page);
			const payload = pagePayload({ ...page.content, components: session.#components(page, false) });
			const updated = session.#write(() => int.editReply(payload));
			initialEdit = updated;
			const message = await updated;
			if (cancelled) return;
			session.#listen(message, release);
			listening = true;
			return session;
		} catch (error) {
			console.error(error);
			if (cancelled) return;
			initialEdit = int.editReply(
				pagePayload(
					options.fail_msg ?? { components: [new TextDisplayBuilder().setContent('Failed to get data.')] },
				),
			);
			await initialEdit;
		} finally {
			if (!listening) release();
		}
	}

	/** Stops pagination and disables its controls, leaving the current page visible. */
	async stop(): Promise<void> {
		if (!this.#closed) this.#collector?.stop('manual');
		await this.#finished;
	}

	#components(page: Page<Data>, disabled: boolean): ScrollableContent['components'] {
		const { index, data, content } = page;
		const controls = new ActionRowBuilder<ButtonBuilder>().addComponents(
			new ButtonBuilder()
				.setCustomId(previousId)
				.setLabel('←')
				.setStyle(ButtonStyle.Secondary)
				.setDisabled(disabled || index === 0),
			new ButtonBuilder()
				.setCustomId(nextId)
				.setLabel('→')
				.setStyle(ButtonStyle.Secondary)
				.setDisabled(disabled || index === data.length - 1),
			new ButtonBuilder()
				.setCustomId(reloadId)
				.setLabel('↻')
				.setStyle(ButtonStyle.Secondary)
				.setDisabled(disabled),
		);
		if (this.#options.show_page_count !== false) {
			controls.addComponents(
				new ButtonBuilder()
					.setCustomId('scrollable_page_count')
					.setLabel(`${index + 1} / ${data.length}`)
					.setStyle(ButtonStyle.Secondary)
					.setDisabled(true),
			);
		}
		return [...content.components, controls];
	}

	#listen(message: Message, release: () => void) {
		const collector = message.createMessageComponentCollector({
			componentType: ComponentType.Button,
			filter: ({ customId }) => customId === previousId || customId === nextId || customId === reloadId,
			idle: idleTimeout,
		});
		this.#collector = collector;
		const initialIdle = this.#options.int.createdTimestamp + tokenLifetime - Date.now() - tokenExpiryBuffer;
		if (initialIdle < idleTimeout) collector.resetTimer({ idle: Math.max(1, initialIdle) });

		collector.on('collect', (click) => {
			collector.collected.delete(click.id);
			collector.users.delete(click.user.id);
			this.#collect(click);
		});
		collector.once('end', (_, reason) => {
			this.#closed = true;
			const finished = reason === 'idle' || reason === 'manual' ? this.#expire() : this.#editing;
			this.#finished = finished.finally(release);
			void this.#finished.catch(console.error);
		});
	}

	#collect(click: ButtonInteraction) {
		if (this.#closed) return;
		const acknowledged = click.deferUpdate().then(
			() => {
				if (click.createdTimestamp >= this.#latestInteraction.createdTimestamp) this.#latestInteraction = click;
				return true;
			},
			(error) => {
				console.error(error);
				return false;
			},
		);
		if (this.#options.controllable !== 'all' && click.user.id !== this.#options.int.user.id) return;

		this.#pending++;
		this.#queue = this.#queue.then(() => this.#handleClick(click.customId, acknowledged)).catch(console.error);
	}

	async #handleClick(customId: string, acknowledged: Promise<boolean>) {
		try {
			if (!(await acknowledged) || this.#closed) return;

			const reload = customId === reloadId;
			const offset = customId === nextId ? 1 : -1;
			const { data, index } = this.#page;
			const nextIndex = reload ? 0 : Math.max(0, Math.min(index + offset, data.length - 1));
			if (!reload && nextIndex === index) return;

			await this.#setControls(true);
			if (this.#closed) return;
			const nextData = reload ? await this.#options.data() : data;
			if (this.#closed) return;
			if (!nextData.length) {
				await this.#write(async () => {
					await this.#latestInteraction.editReply(emptyPayload(this.#options.empty_msg));
					this.#collector?.stop('empty');
				});
				return;
			}
			const nextPage = await renderPage(this.#options, nextData, nextIndex);
			if (this.#closed) return;

			await this.#write(async () => {
				const disabled = this.#pending > 1;
				const components = this.#components(nextPage, disabled);
				await this.#latestInteraction.editReply({ components, files: nextPage.content.files, attachments: [] });
				this.#page = nextPage;
				this.#disabled = disabled;
			});
		} catch (error) {
			console.error(error);
		} finally {
			this.#pending--;
			if (!this.#closed && this.#pending === 0) await this.#setControls(false);
		}
	}

	async #setControls(disabled: boolean) {
		if (disabled === this.#disabled) return;
		await this.#write(async () => {
			await this.#latestInteraction.editReply({ components: this.#components(this.#page, disabled) });
			this.#disabled = disabled;
		});
	}

	#write<Result>(edit: () => Promise<Result>): Promise<Result> {
		const editing = edit();
		this.#editing = editing.then(
			() => {},
			() => {},
		);
		return editing;
	}

	async #stop() {
		this.#replaced = true;
		this.#closed = true;
		this.#collector?.stop('replaced');
		await this.#editing;
	}

	async #expire() {
		await this.#editing;
		if (!this.#replaced) await this.#setControls(true);
	}
}

/**
 * Displays paginated Components V2 content in an interaction reply.
 * The session stays in memory and disables its controls after ten minutes without a click.
 *
 * @param data The interaction, data loader, and renderer for the paginator.
 * @returns A handle for stopping the session, or undefined if no session opened.
 * @example
 * ```ts
 * import { Command, TextDisplayBuilder, create_scrollable } from '@warsam-e/echo';
 *
 * new Command({ name: 'pages', description: 'Show two pages' })
 *   .addHandler('chat_input', (_, int) => create_scrollable({
 *     int,
 *     data: () => [{ title: 'First' }, { title: 'Second' }],
 *     match: ({ title }) => ({ components: [new TextDisplayBuilder().setContent(title)] }),
 *   }));
 * ```
 */
export const create_scrollable = <Data extends ScrollableDataType>(data: ScrollableData<Data>) => Scrollable.init(data);
