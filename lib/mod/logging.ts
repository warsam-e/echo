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
		cb?: () => Awaitable<unknown>;
		bot: Echo | null;
	},
	...message: StringLike[]
) {
	const logTitle = bot?.isSharding ? `#${bot.shard?.ids.join(',')}_${title}` : title;
	const label = echo_color(`[Echo / ${logTitle}]`);
	if (!cb) return console.log(label, ...message);
	const start = performance.now();
	await cb();
	const elapsed = performance.now() - start;
	console.log(label, ...message, `(${elapsed.toFixed(1)} ms)`);
}

const { green, red } = chalk;

export { green, red };
