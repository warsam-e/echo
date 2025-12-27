import { get_default_cmds } from '@index.ts';
import ac from './ac.ts';
import buttons from './buttons.ts';
import cm from './cm.ts';
import locale_test from './locale_test.ts';
import modal from './modal.ts';
import nsfw_cmd from './nsfw_cmd.ts';
import profile from './profile.ts';
import scrollable from './scrollable.ts';
import sub from './sub.ts';
import user from './user.ts';

const default_cmds = get_default_cmds();

export default [
	ac,
	buttons,
	cm,
	locale_test,
	modal,
	profile,
	scrollable,
	sub,
	nsfw_cmd,
	user,
	...Object.values(default_cmds),
];
