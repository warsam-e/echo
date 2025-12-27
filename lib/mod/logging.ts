import type { StringLike } from 'bun';
import chalk from 'chalk';
import type { Awaitable } from 'discord.js';
import type { Echo } from '$index.ts';

export const echo_color = chalk.rgb(114, 137, 218);

export async function _echo_log(
	{
		title,
		cb,
		bot,
	}: {
		title: string;
		cb?: Awaitable<StringLike>;
		bot: Echo | null;
	},
	...message: StringLike[]
) {
	const _title = bot?.isSharding ? `#${bot.shard?.ids.join(',')}_${title}` : title;
	if (typeof cb === 'undefined') return console.log(echo_color(`[Echo / ${_title}]`), ...message);
	console.time(...message.toString());
	await cb;
	console.timeEnd(...message.toString());
}

const { green, red } = chalk;

export { green, red };
