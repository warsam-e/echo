import { Command, set_locales } from '@index.ts';

export default new Command({
	name: set_locales({
		default: 'locale_test',
		ja: 'ロケールテスト',
	}),
	description: set_locales({
		default: 'Locale test command.',
		ja: 'ロケールのテスト用コマンドです。',
	}),
}).addHandler('chat_input', (_bot, int) => int.reply('blah'));
