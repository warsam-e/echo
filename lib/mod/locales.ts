import type { Locale as DiscordLocale } from 'discord.js';

/** @inline */
type LocaleTranslations = Partial<Record<DiscordLocale, string>>;

/**
 * A map of translations with a default value.
 */
export class Locales extends Map<DiscordLocale | 'default', string> {
	toJSON(): LocaleTranslations {
		const obj: LocaleTranslations = {};
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
export function set_locales(locales: LocaleTranslations & { default: string }): Locales {
	if (typeof locales.default !== 'string' || !locales.default.trim()) {
		throw new Error('Locales require a non-empty default value.');
	}
	return new Locales(
		Object.entries(locales).map(([key, value]) => [key as DiscordLocale | 'default', value] as const),
	);
}
