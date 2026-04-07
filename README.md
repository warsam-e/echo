# @warsam-e/echo

<a href="https://www.npmjs.com/package/@warsam-e/echo"><img src="https://img.shields.io/npm/v/@warsam-e/echo?maxAge=300" alt="npm version" /></a>
<a href="https://www.npmjs.com/package/@warsam-e/echo"><img src="https://img.shields.io/npm/dt/@warsam-e/echo.svg?maxAge=300" alt="npm downloads" /></a>

### Simplifies the creation and handling of slash commands in Discord bots.

## Installation

```zsh
% bun i @warsam-e/echo
```

## Basic Usage

```ts
import Echo, { Command } from '$warsam-e/echo';

let commands = [
	new Command<Echo>({
		name: 'ping',
		description: 'Pong!',
		owners_only: true, // default: false
		nsfw: true, // default: false
	}).addHandler('chat_input', async (bot, int) => {
		const sent = await int.deferReply({ withResponse: true });
		if (!sent.resource?.message?.createdTimestamp)
			return int.editReply('An error occured while executing the command.');
		const diff = sent.resource?.message?.createdTimestamp - int.createdTimestamp;

		const content = [
			'### 🏓 Pong!',
			`## ${diff}ms`,
			...(bot.isSharding ? [`-# via shard #${bot.shardId}`] : []),
		].join('\n');

		return int.editReply(content);
	})
];

new Echo({
	name: 'MyBot',
	color: 'LuminousVividPink',
})
	.register_commands(commands)
	.init(); // starts the bot, .init(TOKEN) if `TOKEN` env is not set
```

## Scrollable
Echo includes a class called `Scrollable` which can be used to create scrollable content.

To initate this class, you can use the `create_scrollable` function.

```ts
import { Command, create_scrollable } from '$warsam-e/echo';

new Command({})
.addHandler("chat_input", (bot, int) => create_scrollable({
	int,
	data: () => [{ title: "foo" }, { title: "bar" }],
	match: (v) => ({
    	content: `## ${v.title}`
  	})
}));
```
