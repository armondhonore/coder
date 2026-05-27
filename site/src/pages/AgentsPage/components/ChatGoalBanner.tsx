import {
	CheckIcon,
	CirclePauseIcon,
	CirclePlayIcon,
	type LucideIcon,
	TargetIcon,
	Trash2Icon,
} from "lucide-react";
import type { ComponentProps, FC } from "react";
import {
	type ChatGoalAction,
	type CurrentChatGoalStatus,
	chatGoalActionsForStatus,
	isCurrentChatGoalStatus,
} from "#/api/queries/chatGoal";
import type * as TypesGen from "#/api/typesGenerated";
import { Badge } from "#/components/Badge/Badge";
import { Button } from "#/components/Button/Button";

type ChatGoalBannerProps = {
	goal: TypesGen.ChatGoal | undefined;
	canMutateGoal?: boolean;
	isActionPending?: boolean;
	isActionDisabled?: boolean;
	onAction: (action: ChatGoalAction) => Promise<void> | void;
};

type GoalStatusUI = {
	label: string;
	variant: ComponentProps<typeof Badge>["variant"];
};

const GOAL_STATUS_UI = {
	active: { label: "Active", variant: "info" },
	paused: { label: "Paused", variant: "warning" },
	complete: { label: "Complete", variant: "green" },
} satisfies Record<CurrentChatGoalStatus, GoalStatusUI>;

type GoalActionUI = {
	label: string;
	Icon: LucideIcon;
};

const GOAL_ACTION_UI = {
	pause: { label: "Pause", Icon: CirclePauseIcon },
	resume: { label: "Resume", Icon: CirclePlayIcon },
	complete: { label: "Complete", Icon: CheckIcon },
	clear: { label: "Clear", Icon: Trash2Icon },
} satisfies Record<ChatGoalAction, GoalActionUI>;

export const ChatGoalBanner: FC<ChatGoalBannerProps> = ({
	goal,
	canMutateGoal = true,
	isActionPending = false,
	isActionDisabled = false,
	onAction,
}) => {
	if (!goal || !isCurrentChatGoalStatus(goal.status)) {
		return null;
	}

	const statusUI = GOAL_STATUS_UI[goal.status];
	const actions = canMutateGoal ? chatGoalActionsForStatus(goal.status) : [];
	const disabled = isActionPending || isActionDisabled;

	return (
		<section
			aria-label="Current goal"
			className="mx-auto mb-2 flex w-full max-w-3xl flex-col gap-2 rounded-lg border border-border-default bg-surface-secondary px-3 py-2 text-sm shadow-sm sm:flex-row sm:items-center sm:justify-between"
		>
			<div className="flex min-w-0 items-start gap-2">
				<TargetIcon className="mt-0.5 size-icon-sm shrink-0 text-content-secondary" />
				<div className="min-w-0 space-y-1">
					<div className="flex flex-wrap items-center gap-2">
						<span className="font-medium text-content-primary">Goal</span>
						<Badge size="sm" variant={statusUI.variant}>
							{statusUI.label}
						</Badge>
					</div>
					<p className="whitespace-pre-wrap break-words text-content-secondary">
						{goal.objective.trim() || "No objective provided."}
					</p>
					{goal.completion_summary ? (
						<p className="whitespace-pre-wrap break-words text-xs text-content-secondary">
							Summary: {goal.completion_summary}
						</p>
					) : null}
				</div>
			</div>
			{actions.length > 0 ? (
				<div className="flex flex-wrap gap-1 sm:justify-end">
					{actions.map((action) => {
						const actionUI = GOAL_ACTION_UI[action];
						const Icon = actionUI.Icon;
						return (
							<Button
								key={action}
								size="xs"
								variant={action === "clear" ? "subtle" : "outline"}
								disabled={disabled}
								onClick={() => {
									void (async () => {
										await onAction(action);
									})().catch(() => undefined);
								}}
							>
								<Icon />
								{actionUI.label}
							</Button>
						);
					})}
				</div>
			) : null}
		</section>
	);
};
