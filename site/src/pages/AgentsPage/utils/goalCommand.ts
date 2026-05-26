import type * as TypesGen from "#/api/typesGenerated";

type ParsedGoalCommand =
	| { kind: "show" }
	| {
			kind: "set";
			objective: string;
			mutation: TypesGen.ChatGoalMutation;
	  }
	| {
			kind: "lifecycle";
			action: Exclude<TypesGen.ChatGoalMutationAction, "set">;
			mutation: TypesGen.ChatGoalMutation;
	  }
	| { kind: "unsupported"; reason: string };

const commandPrefix = "/goal";
const summaryFlag = "--summary";
const budgetFlags = new Set(["--budget"]);
const turnCapFlags = new Set([
	"--turn",
	"--turns",
	"--max-turn",
	"--max-turns",
	"--turn-cap",
	"--turn-limit",
]);

const isFlagToken = (token: string, flags: ReadonlySet<string>): boolean => {
	for (const flag of flags) {
		if (token === flag || token.startsWith(`${flag}=`)) {
			return true;
		}
	}
	return false;
};

const unsupportedReservedCommand = (command: string): ParsedGoalCommand => ({
	kind: "unsupported",
	reason: `Use /goal ${command} without extra text, or /goal -- ${command} ... to set an objective starting with ${command}.`,
});

const makeLifecycleMutation = (
	action: Exclude<TypesGen.ChatGoalMutationAction, "set">,
	completionSummary?: string,
): ParsedGoalCommand => ({
	kind: "lifecycle",
	action,
	mutation:
		completionSummary === undefined
			? { action }
			: { action, completion_summary: completionSummary },
});

export const parseGoalCommand = (message: string): ParsedGoalCommand | null => {
	if (!message.startsWith(commandPrefix)) {
		return null;
	}

	const afterPrefix = message.slice(commandPrefix.length);
	if (afterPrefix.length > 0 && !/^\s/.test(afterPrefix)) {
		return null;
	}

	const args = afterPrefix.trim();
	if (!args) {
		return { kind: "show" };
	}

	const firstToken = args.split(/\s+/, 1)[0] ?? "";
	const firstTokenLower = firstToken.toLowerCase();
	if (
		firstTokenLower === "budget" ||
		firstTokenLower.startsWith("budget=") ||
		isFlagToken(firstTokenLower, budgetFlags) ||
		isFlagToken(firstTokenLower, turnCapFlags)
	) {
		return {
			kind: "unsupported",
			reason:
				"Goal budget and turn limit commands are not supported. Set only the objective.",
		};
	}

	if (args === "--" || args.startsWith("-- ") || args.startsWith("--\n")) {
		const escapedObjective = args.slice(2).trim();
		if (!escapedObjective) {
			return {
				kind: "unsupported",
				reason: "Provide an objective after /goal --.",
			};
		}
		return {
			kind: "set",
			objective: escapedObjective,
			mutation: { action: "set", objective: escapedObjective },
		};
	}

	const rest = args.slice(firstToken.length).trim();
	if (firstTokenLower === "clear") {
		return rest
			? unsupportedReservedCommand("clear")
			: makeLifecycleMutation("clear");
	}
	if (firstTokenLower === "pause") {
		return rest
			? unsupportedReservedCommand("pause")
			: makeLifecycleMutation("pause");
	}
	if (firstTokenLower === "resume") {
		return rest
			? unsupportedReservedCommand("resume")
			: makeLifecycleMutation("resume");
	}
	if (firstTokenLower === "complete") {
		if (!rest) {
			return makeLifecycleMutation("complete");
		}
		const restLower = rest.toLowerCase();
		if (
			restLower === summaryFlag ||
			restLower.startsWith(`${summaryFlag} `) ||
			restLower.startsWith(`${summaryFlag}\n`)
		) {
			const summary = rest.slice(summaryFlag.length).trim();
			if (!summary) {
				return {
					kind: "unsupported",
					reason: "Provide a summary after /goal complete --summary.",
				};
			}
			return makeLifecycleMutation("complete", summary);
		}
		return unsupportedReservedCommand("complete");
	}

	return {
		kind: "set",
		objective: args,
		mutation: { action: "set", objective: args },
	};
};
