import assert from "node:assert";
import type {
	RawAssetGeneratorOptions,
	RawAssetInlineGeneratorOptions,
	RawAssetParserDataUrl,
	RawAssetParserOptions,
	RawAssetResourceGeneratorOptions,
	RawCssAutoGeneratorOptions,
	RawCssAutoParserOptions,
	RawCssGeneratorOptions,
	RawCssModuleGeneratorOptions,
	RawCssModuleParserOptions,
	RawCssParserOptions,
	RawFuncUseCtx,
	RawGeneratorOptions,
	RawJavascriptParserOptions,
	RawLibraryName,
	RawLibraryOptions,
	RawModuleRule,
	RawModuleRuleUse,
	RawOptions,
	RawParserOptions,
	RawRspackFuture,
	RawRuleSetCondition,
	RawRuleSetLogicalConditions
} from "@rspack/binding";

import type { Compiler } from "../Compiler";
import { normalizeStatsPreset } from "../Stats";
import { isNil } from "../util";
import { parseResource } from "../util/identifier";
import {
	type ComposeJsUseOptions,
	type LoaderContext,
	type LoaderDefinition,
	type LoaderDefinitionFunction,
	createRawModuleRuleUses
} from "./adapterRuleUse";
import type {
	ExperimentsNormalized,
	ModuleOptionsNormalized,
	OutputNormalized,
	RspackOptionsNormalized
} from "./normalization";
import type {
	AssetGeneratorDataUrl,
	AssetGeneratorOptions,
	AssetInlineGeneratorOptions,
	AssetParserDataUrl,
	AssetParserOptions,
	AssetResourceGeneratorOptions,
	ChunkLoading,
	CrossOriginLoading,
	CssAutoGeneratorOptions,
	CssGeneratorOptions,
	CssParserOptions,
	GeneratorOptionsByModuleType,
	JavascriptParserOptions,
	LibraryName,
	LibraryOptions,
	Node,
	Optimization,
	ParserOptionsByModuleType,
	Resolve,
	RspackFutureOptions,
	RuleSetCondition,
	RuleSetLogicalConditions,
	RuleSetRule,
	SnapshotOptions,
	StatsValue,
	Target
} from "./zod";

export type { LoaderContext, LoaderDefinition, LoaderDefinitionFunction };

export const getRawOptions = (
	options: RspackOptionsNormalized,
	compiler: Compiler
): RawOptions => {
	assert(
		!isNil(options.context) && !isNil(options.devtool) && !isNil(options.cache),
		"context, devtool, cache should not be nil after defaults"
	);
	const devtool = options.devtool === false ? "" : options.devtool;
	const mode = options.mode;
	const experiments = getRawExperiments(options.experiments);
	return {
		mode,
		target: getRawTarget(options.target),
		context: options.context,
		output: getRawOutput(options.output),
		resolve: getRawResolve(options.resolve),
		resolveLoader: getRawResolve(options.resolveLoader),
		module: getRawModule(options.module, {
			compiler,
			devtool,
			mode,
			context: options.context,
			experiments
		}),
		devtool,
		optimization: getRawOptimization(options.optimization),
		stats: getRawStats(options.stats),
		snapshot: getRawSnapshotOptions(options.snapshot),
		cache: {
			type: options.cache ? "memory" : "disable",
			// TODO: implement below cache options
			maxGenerations: 0,
			maxAge: 0,
			profile: false,
			buildDependencies: [],
			cacheDirectory: "",
			cacheLocation: "",
			name: "",
			version: ""
		},
		experiments,
		node: getRawNode(options.node),
		// SAFETY: applied default value in `applyRspackOptionsDefaults`.
		profile: options.profile!,
		// SAFETY: applied default value in `applyRspackOptionsDefaults`.
		bail: options.bail!,
		__references: {}
	};
};

function getRawTarget(target: Target | undefined): RawOptions["target"] {
	if (!target) {
		return [];
	}
	if (typeof target === "string") {
		return [target];
	}
	return target;
}

function getRawExtensionAlias(
	alias: Resolve["extensionAlias"] = {}
): RawOptions["resolve"]["extensionAlias"] {
	const entries = Object.entries(alias).map(([key, value]) => {
		if (Array.isArray(value)) {
			return [key, value];
		} else {
			return [key, [value]];
		}
	});
	return Object.fromEntries(entries);
}

function getRawAlias(
	alias: Resolve["alias"] = {}
): RawOptions["resolve"]["alias"] {
	return Object.entries(alias).map(([key, value]) => ({
		path: key,
		redirect: Array.isArray(value) ? value : [value]
	}));
}

function getRawResolveByDependency(
	byDependency: Resolve["byDependency"]
): RawOptions["resolve"]["byDependency"] {
	if (byDependency === undefined) return byDependency;
	return Object.fromEntries(
		Object.entries(byDependency).map(([k, v]) => [k, getRawResolve(v)])
	);
}

function getRawTsConfig(
	tsConfig: Resolve["tsConfig"]
): RawOptions["resolve"]["tsconfig"] {
	assert(
		typeof tsConfig !== "string",
		"should resolve string tsConfig in normalization"
	);
	if (tsConfig === undefined) return tsConfig;
	const { configFile, references } = tsConfig;
	return {
		configFile,
		referencesType:
			references == "auto" ? "auto" : references ? "manual" : "disabled",
		references: references == "auto" ? undefined : references
	};
}

export function getRawResolve(resolve: Resolve): RawOptions["resolve"] {
	return {
		...resolve,
		alias: getRawAlias(resolve.alias),
		fallback: getRawAlias(resolve.fallback),
		extensionAlias: getRawExtensionAlias(resolve.extensionAlias) as Record<
			string,
			Array<string>
		>,
		tsconfig: getRawTsConfig(resolve.tsConfig),
		byDependency: getRawResolveByDependency(resolve.byDependency)
	};
}

function getRawCrossOriginLoading(
	crossOriginLoading: CrossOriginLoading
): RawOptions["output"]["crossOriginLoading"] {
	if (typeof crossOriginLoading === "boolean") {
		return { type: "bool", boolPayload: crossOriginLoading };
	}
	return { type: "string", stringPayload: crossOriginLoading };
}

function getRawOutput(output: OutputNormalized): RawOptions["output"] {
	const chunkLoading = output.chunkLoading!;
	const wasmLoading = output.wasmLoading!;
	const workerChunkLoading = output.workerChunkLoading!;
	const workerWasmLoading = output.workerWasmLoading!;
	return {
		path: output.path!,
		pathinfo: output.pathinfo!,
		publicPath: output.publicPath!,
		clean: output.clean!,
		assetModuleFilename: output.assetModuleFilename!,
		filename: output.filename!,
		chunkFilename: output.chunkFilename!,
		chunkLoading: getRawChunkLoading(chunkLoading),
		crossOriginLoading: getRawCrossOriginLoading(output.crossOriginLoading!),
		cssFilename: output.cssFilename!,
		cssChunkFilename: output.cssChunkFilename!,
		hotUpdateChunkFilename: output.hotUpdateChunkFilename!,
		hotUpdateMainFilename: output.hotUpdateMainFilename!,
		hotUpdateGlobal: output.hotUpdateGlobal!,
		uniqueName: output.uniqueName!,
		chunkLoadingGlobal: output.chunkLoadingGlobal!,
		enabledLibraryTypes: output.enabledLibraryTypes,
		library: output.library && getRawLibrary(output.library),
		strictModuleErrorHandling: output.strictModuleErrorHandling!,
		globalObject: output.globalObject!,
		importFunctionName: output.importFunctionName!,
		iife: output.iife!,
		module: output.module!,
		wasmLoading: wasmLoading === false ? "false" : wasmLoading,
		enabledWasmLoadingTypes: output.enabledWasmLoadingTypes!,
		enabledChunkLoadingTypes: output.enabledChunkLoadingTypes!,
		webassemblyModuleFilename: output.webassemblyModuleFilename!,
		trustedTypes: output.trustedTypes!,
		sourceMapFilename: output.sourceMapFilename!,
		hashFunction: output.hashFunction!,
		hashDigest: output.hashDigest!,
		hashDigestLength: output.hashDigestLength!,
		hashSalt: output.hashSalt!,
		asyncChunks: output.asyncChunks!,
		workerChunkLoading:
			workerChunkLoading === false ? "false" : workerChunkLoading,
		workerWasmLoading:
			workerWasmLoading === false ? "false" : workerWasmLoading,
		workerPublicPath: output.workerPublicPath!,
		scriptType: output.scriptType === false ? "false" : output.scriptType!,
		charset: output.charset!,
		chunkLoadTimeout: output.chunkLoadTimeout!,
		environment: output.environment!
	};
}

export function getRawLibrary(library: LibraryOptions): RawLibraryOptions {
	const {
		type,
		name,
		export: libraryExport,
		umdNamedDefine,
		auxiliaryComment,
		amdContainer
	} = library;
	return {
		amdContainer,
		auxiliaryComment:
			typeof auxiliaryComment === "string"
				? {
						commonjs: auxiliaryComment,
						commonjs2: auxiliaryComment,
						amd: auxiliaryComment,
						root: auxiliaryComment
					}
				: auxiliaryComment,
		libraryType: type,
		name: isNil(name) ? name : getRawLibraryName(name),
		export:
			Array.isArray(libraryExport) || libraryExport == null
				? libraryExport
				: [libraryExport],
		umdNamedDefine
	};
}

function getRawLibraryName(name: LibraryName): RawLibraryName {
	if (typeof name === "string") {
		return {
			type: "string",
			stringPayload: name
		};
	}
	if (Array.isArray(name)) {
		return {
			type: "array",
			arrayPayload: name
		};
	}
	if (typeof name === "object" && !Array.isArray(name)) {
		return {
			type: "umdObject",
			umdObjectPayload: {
				commonjs: name.commonjs,
				root:
					Array.isArray(name.root) || isNil(name.root)
						? name.root
						: [name.root],
				amd: name.amd
			}
		};
	}
	throw new Error("unreachable");
}

function getRawModule(
	module: ModuleOptionsNormalized,
	options: ComposeJsUseOptions
): RawOptions["module"] {
	assert(
		!isNil(module.defaultRules),
		"module.defaultRules should not be nil after defaults"
	);
	// "..." in defaultRules will be flatten in `applyModuleDefaults`, and "..." in rules is empty, so it's safe to use `as RuleSetRule[]` at here
	const ruleSet = [
		{ rules: module.defaultRules as RuleSetRule[] },
		{ rules: module.rules as RuleSetRule[] }
	];
	const rules = ruleSet.map((rule, index) =>
		getRawModuleRule(rule, `ruleSet[${index}]`, options, "javascript/auto")
	);
	return {
		rules,
		parser: getRawParserOptionsByModuleType(module.parser),
		generator: getRawGeneratorOptionsByModuleType(module.generator),
		noParse: module.noParse
	};
}

function tryMatch(payload: string, condition: RuleSetCondition): boolean {
	if (typeof condition === "string") {
		return payload.startsWith(condition);
	}

	if (condition instanceof RegExp) {
		return condition.test(payload);
	}

	if (typeof condition === "function") {
		return condition(payload);
	}

	if (Array.isArray(condition)) {
		return condition.some(c => tryMatch(payload, c));
	}

	if (condition && typeof condition === "object") {
		if (condition.and) {
			return condition.and.every(c => tryMatch(payload, c));
		}

		if (condition.or) {
			return condition.or.some(c => tryMatch(payload, c));
		}

		if (condition.not) {
			return !tryMatch(payload, condition.not);
		}
	}

	return false;
}

const getRawModuleRule = (
	rule: RuleSetRule,
	path: string,
	options: ComposeJsUseOptions,
	upperType: string
): RawModuleRule => {
	// Rule.loader is a shortcut to Rule.use: [ { loader } ].
	// See: https://webpack.js.org/configuration/module/#ruleloader
	if (rule.loader) {
		rule.use = [
			{
				loader: rule.loader,
				options: rule.options
			}
		];
	}
	let funcUse: undefined | ((rawContext: RawFuncUseCtx) => RawModuleRuleUse[]);
	if (typeof rule.use === "function") {
		const use = rule.use;
		funcUse = (rawContext: RawFuncUseCtx) => {
			const context = {
				...rawContext,
				compiler: options.compiler
			};
			const uses = use(context);

			return createRawModuleRuleUses(uses ?? [], `${path}.use`, options);
		};
	}

	const rawModuleRule: RawModuleRule = {
		test: rule.test ? getRawRuleSetCondition(rule.test) : undefined,
		include: rule.include ? getRawRuleSetCondition(rule.include) : undefined,
		exclude: rule.exclude ? getRawRuleSetCondition(rule.exclude) : undefined,
		issuer: rule.issuer ? getRawRuleSetCondition(rule.issuer) : undefined,
		dependency: rule.dependency
			? getRawRuleSetCondition(rule.dependency)
			: undefined,
		descriptionData: rule.descriptionData
			? Object.fromEntries(
					Object.entries(rule.descriptionData).map(([k, v]) => [
						k,
						getRawRuleSetCondition(v)
					])
				)
			: undefined,
		resource: rule.resource ? getRawRuleSetCondition(rule.resource) : undefined,
		resourceQuery: rule.resourceQuery
			? getRawRuleSetCondition(rule.resourceQuery)
			: undefined,
		resourceFragment: rule.resourceFragment
			? getRawRuleSetCondition(rule.resourceFragment)
			: undefined,
		scheme: rule.scheme ? getRawRuleSetCondition(rule.scheme) : undefined,
		mimetype: rule.mimetype ? getRawRuleSetCondition(rule.mimetype) : undefined,
		sideEffects: rule.sideEffects,
		use:
			typeof rule.use === "function"
				? funcUse
				: createRawModuleRuleUses(rule.use ?? [], `${path}.use`, options),
		type: rule.type,
		parser: rule.parser
			? getRawParserOptions(rule.parser, rule.type ?? upperType)
			: undefined,
		generator: rule.generator
			? getRawGeneratorOptions(rule.generator, rule.type ?? upperType)
			: undefined,
		resolve: rule.resolve ? getRawResolve(rule.resolve) : undefined,
		oneOf: rule.oneOf
			? rule.oneOf.map((rule, index) =>
					getRawModuleRule(
						rule,
						`${path}.oneOf[${index}]`,
						options,
						rule.type ?? upperType
					)
				)
			: undefined,
		rules: rule.rules
			? rule.rules.map((rule, index) =>
					getRawModuleRule(
						rule,
						`${path}.rules[${index}]`,
						options,
						rule.type ?? upperType
					)
				)
			: undefined,
		enforce: rule.enforce
	};

	// Function calls may contain side-effects when interoperating with single-threaded environment.
	// In order to mitigate the issue, Rspack tries to merge these calls together.
	// See: https://github.com/web-infra-dev/rspack/issues/4003#issuecomment-1689662380
	if (
		typeof rule.test === "function" ||
		typeof rule.resource === "function" ||
		typeof rule.resourceQuery === "function" ||
		typeof rule.resourceFragment === "function"
	) {
		delete rawModuleRule.test;
		delete rawModuleRule.resource;
		delete rawModuleRule.resourceQuery;
		delete rawModuleRule.resourceFragment;

		rawModuleRule.rspackResource = getRawRuleSetCondition(
			resourceQueryFragment => {
				const { path, query, fragment } = parseResource(resourceQueryFragment);

				if (rule.test && !tryMatch(path, rule.test)) {
					return false;
				} else if (rule.resource && !tryMatch(path, rule.resource)) {
					return false;
				}

				if (rule.resourceQuery && !tryMatch(query, rule.resourceQuery)) {
					return false;
				}

				if (
					rule.resourceFragment &&
					!tryMatch(fragment, rule.resourceFragment)
				) {
					return false;
				}

				return true;
			}
		);
	}
	return rawModuleRule;
};

function getRawRuleSetCondition(
	condition: RuleSetCondition
): RawRuleSetCondition {
	if (typeof condition === "string") {
		return {
			type: "string",
			stringMatcher: condition
		};
	}
	if (condition instanceof RegExp) {
		return {
			type: "regexp",
			regexpMatcher: {
				source: condition.source,
				flags: condition.flags
			}
		};
	}
	if (typeof condition === "function") {
		return {
			type: "function",
			funcMatcher: condition
		};
	}
	if (Array.isArray(condition)) {
		return {
			type: "array",
			arrayMatcher: condition.map(i => getRawRuleSetCondition(i))
		};
	}
	if (typeof condition === "object" && condition !== null) {
		return {
			type: "logical",
			logicalMatcher: [getRawRuleSetLogicalConditions(condition)]
		};
	}
	throw new Error(
		"unreachable: condition should be one of string, RegExp, Array, Object"
	);
}

function getRawRuleSetLogicalConditions(
	logical: RuleSetLogicalConditions
): RawRuleSetLogicalConditions {
	return {
		and: logical.and
			? logical.and.map(i => getRawRuleSetCondition(i))
			: undefined,
		or: logical.or ? logical.or.map(i => getRawRuleSetCondition(i)) : undefined,
		not: logical.not ? getRawRuleSetCondition(logical.not) : undefined
	};
}

function getRawParserOptionsByModuleType(
	parser: ParserOptionsByModuleType
): Record<string, RawParserOptions> {
	return Object.fromEntries(
		Object.entries(parser)
			.map(([k, v]) => [k, getRawParserOptions(v, k)])
			.filter(([k, v]) => v !== undefined)
	);
}

function getRawGeneratorOptionsByModuleType(
	parser: GeneratorOptionsByModuleType
): Record<string, RawGeneratorOptions> {
	return Object.fromEntries(
		Object.entries(parser)
			.map(([k, v]) => [k, getRawGeneratorOptions(v, k)])
			.filter(([k, v]) => v !== undefined)
	);
}

function getRawParserOptions(
	parser: { [k: string]: any },
	type: string
): RawParserOptions | undefined {
	if (type === "asset") {
		return {
			type: "asset",
			asset: getRawAssetParserOptions(parser)
		};
	} else if (type === "javascript") {
		// Filter this out, since `parser["javascript"]` already merge into `parser["javascript/*"]` in default.ts
		return;
	} else if (type === "javascript/auto") {
		return {
			type: "javascript/auto",
			javascript: getRawJavascriptParserOptions(parser)
		};
	} else if (type === "javascript/dynamic") {
		return {
			type: "javascript/dynamic",
			javascript: getRawJavascriptParserOptions(parser)
		};
	} else if (type === "javascript/esm") {
		return {
			type: "javascript/esm",
			javascript: getRawJavascriptParserOptions(parser)
		};
	} else if (type === "css") {
		return {
			type: "css",
			css: getRawCssParserOptions(parser)
		};
	} else if (type === "css/auto") {
		return {
			type: "css/auto",
			cssAuto: getRawCssParserOptions(parser)
		};
	} else if (type === "css/module") {
		return {
			type: "css/module",
			cssModule: getRawCssParserOptions(parser)
		};
	}
	// FIXME: shouldn't depend on module type, for example: `rules: [{ test: /\.css/, generator: {..} }]` will error
	throw new Error(`unreachable: unknow module type: ${type}`);
}

function getRawJavascriptParserOptions(
	parser: JavascriptParserOptions
): RawJavascriptParserOptions {
	return {
		dynamicImportMode: parser.dynamicImportMode ?? "lazy",
		dynamicImportPreload: parser.dynamicImportPreload?.toString() ?? "false",
		dynamicImportPrefetch: parser.dynamicImportPrefetch?.toString() ?? "false",
		dynamicImportFetchPriority: parser.dynamicImportFetchPriority?.toString(),
		url:
			parser.url === false
				? "false"
				: parser.url === "relative"
					? parser.url
					: "true",
		exprContextCritical: parser.exprContextCritical ?? true,
		wrappedContextCritical: parser.wrappedContextCritical ?? false,
		exportsPresence:
			parser.exportsPresence === false ? "false" : parser.exportsPresence,
		importExportsPresence:
			parser.importExportsPresence === false
				? "false"
				: parser.importExportsPresence,
		reexportExportsPresence:
			parser.reexportExportsPresence === false
				? "false"
				: parser.reexportExportsPresence,
		strictExportPresence: parser.strictExportPresence ?? false,
		worker: getRawJavascriptParserOptionsWorker(parser.worker!),
		overrideStrict: parser.overrideStrict
	};
}

function getRawJavascriptParserOptionsWorker(
	worker: boolean | string[]
): RawJavascriptParserOptions["worker"] {
	const DEFAULT_SYNTAX = [
		"Worker",
		"SharedWorker",
		"navigator.serviceWorker.register()",
		"Worker from worker_threads"
	];
	return (
		worker === false ? [] : Array.isArray(worker) ? worker : ["..."]
	).flatMap(item => (item === "..." ? DEFAULT_SYNTAX : item));
}

function getRawAssetParserOptions(
	parser: AssetParserOptions
): RawAssetParserOptions {
	return {
		dataUrlCondition: parser.dataUrlCondition
			? getRawAssetParserDataUrl(parser.dataUrlCondition)
			: undefined
	};
}

function getRawAssetParserDataUrl(
	dataUrlCondition: AssetParserDataUrl
): RawAssetParserDataUrl {
	if (typeof dataUrlCondition === "object" && dataUrlCondition !== null) {
		return {
			type: "options",
			options: {
				maxSize: dataUrlCondition.maxSize
			}
		};
	}
	throw new Error(
		`unreachable: AssetParserDataUrl type should be one of "options", but got ${dataUrlCondition}`
	);
}

function getRawCssParserOptions(
	parser: CssParserOptions
): RawCssParserOptions | RawCssAutoParserOptions | RawCssModuleParserOptions {
	return {
		namedExports: parser.namedExports
	};
}

function getRawGeneratorOptions(
	generator: { [k: string]: any },
	type: string
): RawGeneratorOptions | undefined {
	if (type === "asset") {
		return {
			type: "asset",
			asset: generator ? getRawAssetGeneratorOptions(generator) : undefined
		};
	}
	if (type === "asset/inline") {
		return {
			type: "asset/inline",
			assetInline: generator
				? getRawAssetInlineGeneratorOptions(generator)
				: undefined
		};
	}
	if (type === "asset/resource") {
		return {
			type: "asset/resource",
			assetResource: generator
				? getRawAssetResourceGeneratorOptions(generator)
				: undefined
		};
	}
	if (type === "css") {
		return {
			type: "css",
			css: getRawCssGeneratorOptions(generator)
		};
	}
	if (type === "css/auto") {
		return {
			type: "css/auto",
			cssAuto: getRawCssAutoOrModuleGeneratorOptions(generator)
		};
	}
	if (type === "css/module") {
		return {
			type: "css/module",
			cssModule: getRawCssAutoOrModuleGeneratorOptions(generator)
		};
	}

	if (
		[
			"javascript",
			"javascript/auto",
			"javascript/dynamic",
			"javascript/esm"
		].includes(type)
	) {
		return undefined;
	}

	throw new Error(`unreachable: unknow module type: ${type}`);
}

function getRawAssetGeneratorOptions(
	options: AssetGeneratorOptions
): RawAssetGeneratorOptions {
	return {
		...getRawAssetInlineGeneratorOptions(options),
		...getRawAssetResourceGeneratorOptions(options)
	};
}

function getRawAssetInlineGeneratorOptions(
	options: AssetInlineGeneratorOptions
): RawAssetInlineGeneratorOptions {
	return {
		dataUrl: options.dataUrl
			? getRawAssetGeneratorDataUrl(options.dataUrl)
			: undefined
	};
}

function getRawAssetResourceGeneratorOptions(
	options: AssetResourceGeneratorOptions
): RawAssetResourceGeneratorOptions {
	return {
		emit: options.emit,
		filename: options.filename,
		publicPath: options.publicPath
	};
}

function getRawAssetGeneratorDataUrl(dataUrl: AssetGeneratorDataUrl) {
	if (typeof dataUrl === "object" && dataUrl !== null) {
		const encoding = dataUrl.encoding === false ? "false" : dataUrl.encoding;
		return {
			encoding,
			mimetype: dataUrl.mimetype
		} as const;
	}
	if (typeof dataUrl === "function" && dataUrl !== null) {
		return dataUrl;
	}
	throw new Error(
		`unreachable: AssetGeneratorDataUrl type should be one of "options", "function", but got ${dataUrl}`
	);
}

function getRawCssGeneratorOptions(
	options: CssGeneratorOptions
): RawCssGeneratorOptions {
	return {
		exportsOnly: options.exportsOnly,
		esModule: options.esModule
	};
}

function getRawCssAutoOrModuleGeneratorOptions(
	options: CssAutoGeneratorOptions
): RawCssAutoGeneratorOptions | RawCssModuleGeneratorOptions {
	return {
		localIdentName: options.localIdentName,
		exportsConvention: options.exportsConvention,
		exportsOnly: options.exportsOnly,
		esModule: options.esModule
	};
}

function getRawOptimization(
	optimization: Optimization
): RawOptions["optimization"] {
	assert(
		!isNil(optimization.removeAvailableModules) &&
			!isNil(optimization.sideEffects) &&
			!isNil(optimization.realContentHash) &&
			!isNil(optimization.providedExports) &&
			!isNil(optimization.usedExports) &&
			!isNil(optimization.innerGraph) &&
			"optimization.moduleIds, optimization.removeAvailableModules, optimization.removeEmptyChunks, optimization.sideEffects, optimization.realContentHash, optimization.providedExports, optimization.usedExports, optimization.innerGraph, optimization.concatenateModules should not be nil after defaults"
	);
	return {
		removeAvailableModules: optimization.removeAvailableModules,
		sideEffects: String(optimization.sideEffects),
		usedExports: String(optimization.usedExports),
		providedExports: optimization.providedExports,
		innerGraph: optimization.innerGraph,
		concatenateModules: !!optimization.concatenateModules,
		mangleExports: String(optimization.mangleExports)
	};
}

function getRawSnapshotOptions(
	_snapshot: SnapshotOptions
): RawOptions["snapshot"] {
	return {};
}

function getRawExperiments(
	experiments: ExperimentsNormalized
): RawOptions["experiments"] {
	const { topLevelAwait, rspackFuture } = experiments;
	assert(!isNil(topLevelAwait) && !isNil(rspackFuture));

	return {
		topLevelAwait,
		rspackFuture: getRawRspackFutureOptions(rspackFuture)
	};
}

function getRawRspackFutureOptions(
	_future: RspackFutureOptions
): RawRspackFuture {
	return {};
}

function getRawNode(node: Node): RawOptions["node"] {
	if (node === false) {
		return undefined;
	}
	assert(
		!isNil(node.__dirname) && !isNil(node.global) && !isNil(node.__filename)
	);
	return {
		dirname: String(node.__dirname),
		filename: String(node.__filename),
		global: String(node.global)
	};
}

function getRawStats(stats: StatsValue): RawOptions["stats"] {
	const statsOptions = normalizeStatsPreset(stats);
	return {
		colors: statsOptions.colors ?? false
	};
}

export function getRawChunkLoading(chunkLoading: ChunkLoading) {
	return chunkLoading === false ? "false" : chunkLoading;
}
