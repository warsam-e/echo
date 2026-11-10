import { arkenv, type } from '@arkenv/core';

export const env = arkenv({
	BOT_TOKEN: type.string.moreThanLength(0),
});
