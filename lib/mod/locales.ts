import type { Locale as DiscordLocale } from '$discord.ts';

export type LocalesPartial = Partial<Record<DiscordLocale | 'default', string>>;

/**
 * A map of locales.
 *
 * Used internally to store locales, and convert them to JSON.
 * @internal
 */
export class Locales extends Map<DiscordLocale | 'default', string> {
	toJSON(): LocalesPartial {
		const obj: LocalesPartial = {};
		for (const [key, value] of this) if (key !== 'default') obj[key] = value;
		return obj;
	}

	/** get the default value */
	get default(): string {
		return this.get('default') ?? '';
	}
}

/**
 * Create a new Locales instance from a partial locales object.
 * @param locales The locales object to create the instance from.
 */
export function set_locales(locales: LocalesPartial): Locales {
	return new Locales(
		Object.entries(locales).map(([key, value]) => [key as DiscordLocale | 'default', value] as const),
	);
}
