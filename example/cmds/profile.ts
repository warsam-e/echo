import { ApplicationCommandType, Command, EmbedBuilder } from '$index.ts';

export default new Command({
	name: 'Get PFP',
	type: ApplicationCommandType.User,
}).addHandler('user_context_menu', (_bot, int) => {
	const member = int.inCachedGuild() ? int.targetMember : null;
	const avatar = (member ?? int.targetUser).displayAvatarURL({ extension: 'png' });
	return int.reply({
		embeds: [new EmbedBuilder().setDescription(`${int.targetUser}'s PFP`).setImage(avatar)],
	});
});
