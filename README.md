# @warsam-e/echo

<a href="https://www.npmjs.com/package/@warsam-e/echo"><img src="https://img.shields.io/npm/v/@warsam-e/echo?maxAge=300" alt="npm version" /></a>
<a href="https://www.npmjs.com/package/@warsam-e/echo"><img src="https://img.shields.io/npm/dt/@warsam-e/echo.svg?maxAge=300" alt="npm downloads" /></a>

### A simpler way to build Discord bots.

## Installation

```sh
bun add @warsam-e/echo
```

## Basic Usage

```ts
import Echo, { Command } from '@warsam-e/echo';

const token = process.env.BOT_TOKEN;
if (!token) throw new Error('Set BOT_TOKEN to your Discord bot token.');

const ping = new Command({
	name: 'ping',
	description: 'Check if the bot is online',
}).addHandler('chat_input', (_, int) => int.reply('Pong!'));

await new Echo({
	name: 'MyBot',
	color: 'LuminousVividPink',
})
	.registerGlobal([ping])
	.init(token);
```

Use `registerGlobal()` to publish commands once for the app. Global commands inherit the app’s Discord install settings unless you set `integration_types` explicitly. Set `contexts: [InteractionContextType.Guild]` to keep a global command usable only in servers.

Use `registerGuild([ping])` to publish the command separately in each server the bot joins. You can chain both registration methods before `init(token)`.

Echo syncs the app’s command lists at startup, removing registrations that are missing from the corresponding list. To customize unexpected error replies, pass a `formatError(error)` function to `new Echo(...)` that returns a message payload.

## Scrollable

`data()` loads the list of items, and `match()` renders the current page as Discord Components V2.

```ts
import { Command, TextDisplayBuilder, create_scrollable } from '@warsam-e/echo';

const pages = new Command({ name: 'pages', description: 'Browse two pages' }).addHandler('chat_input', (_, int) =>
	create_scrollable({
		int,
		data: () => [{ title: 'First page' }, { title: 'Second page' }],
		match: ({ title }) => ({
			components: [new TextDisplayBuilder().setContent(`## ${title}`)],
		}),
	}),
);
```

Add `pages` to either registration list. Page counts are shown by default. Set `show_page_count: false` to hide them. Scrollable disables its controls after 10 minutes without a click.

## Upgrading to v8

- Replace `registerCommands()` with `registerGlobal()` or `registerGuild()`.
- Pass a token to `init(token)` or `EchoSharding.init(path, token)`. Your app is responsible for loading the token.
- Replace `bot.customId(action, int)` with `bot.id(int, action)`. Pass a registered command instance instead of `int` when building controls outside an interaction. Repost buttons or menus that still use the old Echo IDs. Plain IDs still work with your own collectors.
- Include a non-empty `default` value when calling `set_locales()`.
