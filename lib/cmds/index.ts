import type { Echo } from '$index.ts';
import echo from './echo.ts';
import evalc from './evalc.ts';
import ping from './ping.ts';

/**
 * returns the default commands available.
 *
 * It may looks kinda silly, but this is for when you want to override the main type for Echo.
 *
 * Like if you've extended Echo, you can do the following to get the correct type:
 * @example
 * ```ts
 * const commands = get_default_cmds<MyEcho>();
 * const bot = await new MyEcho({ name: 'My Bot', color: 'Blue' })
 *   .registerGuild(Object.values(commands))
 *   .init(token);
 *
 * ```
 */
export const get_default_cmds = <T extends Echo>() => ({
	echo: echo<T>(),
	eval: evalc<T>(),
	ping: ping<T>(),
});
