import { defineConfig } from 'tsdown';

export default defineConfig({
	dts: true,
	minify: true,
	entry: ['./lib/index.ts'],
	sourcemap: true,
	outExtensions: () => ({ js: '.js', dts: '.d.ts' }),
});
