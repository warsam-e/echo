import {
	ActionRowBuilder,
	type ActionRowData,
	type APIMessageTopLevelComponent,
	type Awaitable,
	ButtonBuilder,
	type ButtonInteraction,
	ButtonStyle,
	ComponentType,
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
export type ScrollableDataType = Array<Record<string, any>>;
export type ScrollableDataFn<Data extends ScrollableDataType> = () => Awaitable<Data>;

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

export type ScrollableControlType = 'initiator' | 'all';

export interface ScrollableData<Data extends ScrollableDataType> {
	/** The interaction whose reply will display the paginator. */
	int: RepliableInteraction;
	/**
	 * Show the page count on the buttons row
	 * @default false
	 */
	show_page_count?: boolean;
	/**
	 * The message to show when the first page cannot be loaded or sent.
	 * @default "Failed to get data."
	 */
	fail_msg?: ScrollableContent;
	/** Loads the list of items when the paginator opens or reloads. */
	data: ScrollableDataFn<Data>;
	/**
	 * Who can control the scrollable.
	 * @default 'initiator'
	 */
	controllable?: ScrollableControlType;
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

function pagePayload(page: ScrollableContent): InteractionEditReplyOptions {
	return {
		...page,
		content: null,
		embeds: [],
		attachments: [],
		flags: MessageFlags.IsComponentsV2,
	};
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

	private constructor(options: ScrollableData<Data>, page: Page<Data>) {
		this.#options = { ...options };
		this.#page = page;
		this.#latestInteraction = options.int;
	}

	static async init<Data extends ScrollableDataType>(options: ScrollableData<Data>): Promise<void> {
		const { int } = options;
		if (!int.deferred && !int.replied) await int.deferReply();

		let session: Scrollable<Data>;
		let message: Message;
		try {
			const page = await renderPage(options, await options.data(), 0);
			session = new Scrollable(options, page);
			message = await int.editReply(
				pagePayload({ ...page.content, components: session.#components(page, false) }),
			);
		} catch (error) {
			console.error(error);
			await int.editReply(
				pagePayload(
					options.fail_msg ?? { components: [new TextDisplayBuilder().setContent('Failed to get data.')] },
				),
			);
			return;
		}
		session.#listen(message);
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
		if (this.#options.show_page_count) {
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

	#listen(message: Message) {
		const collector = message.createMessageComponentCollector({
			componentType: ComponentType.Button,
			filter: ({ customId }) => customId === previousId || customId === nextId || customId === reloadId,
			idle: idleTimeout,
		});
		const initialIdle = this.#options.int.createdTimestamp + tokenLifetime - Date.now() - tokenExpiryBuffer;
		if (initialIdle < idleTimeout) collector.resetTimer({ idle: Math.max(1, initialIdle) });

		collector.on('collect', (click) => {
			collector.collected.delete(click.id);
			collector.users.delete(click.user.id);
			this.#collect(click);
		});
		collector.once('end', (_, reason) => {
			this.#closed = true;
			if (reason === 'idle') void this.#expire().catch(console.error);
		});
	}

	#collect(click: ButtonInteraction) {
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
		if (this.#closed || (this.#options.controllable !== 'all' && click.user.id !== this.#options.int.user.id))
			return;

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

	#write(edit: () => Promise<void>) {
		const editing = edit();
		this.#editing = editing.catch(() => {});
		return editing;
	}

	async #expire() {
		await this.#editing;
		await this.#setControls(true);
	}
}

/**
 * Displays paginated Components V2 content in an interaction reply.
 * The session stays in memory and disables its controls after ten minutes without a click.
 *
 * @param data The interaction, data loader, and renderer for the paginator.
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

export type { Scrollable };
