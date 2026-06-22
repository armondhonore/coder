import { EllipsisVerticalIcon, UserPlusIcon } from "lucide-react";
import { type FC, useEffect, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "react-query";
import { useOutletContext } from "react-router";
import { toast } from "sonner";
import type { GroupMemberAISpend } from "#/api/api";
import { getErrorDetail, getErrorMessage } from "#/api/errors";
import {
	addMembers,
	groupMembersAISpend,
	removeMember,
} from "#/api/queries/groups";
import type {
	Group,
	OrganizationMemberWithUserData,
	ReducedUser,
} from "#/api/typesGenerated";
import { Avatar } from "#/components/Avatar/Avatar";
import { AvatarData } from "#/components/Avatar/AvatarData";
import { Button } from "#/components/Button/Button";
import {
	Dialog,
	DialogContent,
	DialogFooter,
	DialogTitle,
} from "#/components/Dialog/Dialog";
import {
	DropdownMenu,
	DropdownMenuContent,
	DropdownMenuItem,
	DropdownMenuTrigger,
} from "#/components/DropdownMenu/DropdownMenu";
import { EmptyState } from "#/components/EmptyState/EmptyState";
import { UsersFilter } from "#/components/Filter/UsersFilter";
import { LastSeen } from "#/components/LastSeen/LastSeen";
import { MultiMemberSelect } from "#/components/MultiUserSelect/MultiUserSelect";
import { PaginationContainer } from "#/components/PaginationWidget/PaginationContainer";
import { Skeleton } from "#/components/Skeleton/Skeleton";
import { Spinner } from "#/components/Spinner/Spinner";
import {
	Table,
	TableBody,
	TableCell,
	TableHead,
	TableHeader,
	TableRow,
} from "#/components/Table/Table";
import { useDashboard } from "#/modules/dashboard/useDashboard";
import { useFeatureVisibility } from "#/modules/dashboard/useFeatureVisibility";
import { isEveryoneGroup } from "#/modules/groups";
import { cn } from "#/utils/cn";
import { microsToDollars, usdBudgetFormatter } from "#/utils/currency";
import type { GroupPageOutletContext } from "./GroupPage";
import { UserAIBudgetOverrideDialog } from "./UserAIBudgetOverrideDialog";

type AIBudgetColumn = {
	spendByUserID: ReadonlyMap<string, GroupMemberAISpend>;
	isLoading: boolean;
};

const GroupMembersPage: FC = () => {
	const {
		group: groupData,
		members,
		organization,
		permissions,
		membersQuery,
		filterProps,
	} = useOutletContext<GroupPageOutletContext>();
	const queryClient = useQueryClient();
	const addMembersMutation = useMutation(addMembers(queryClient, organization));
	const removeMemberMutation = useMutation(
		removeMember(queryClient, organization),
	);
	const canUpdateGroup = permissions ? permissions.canUpdateGroup : false;
	const [budgetUser, setBudgetUser] = useState<ReducedUser | null>(null);

	const { experiments } = useDashboard();
	// TODO(AIGOV-443): remove the ai-gateway-cost-control experiment gate once
	// the cost-control feature is stable.
	const aibridgeVisible =
		Boolean(useFeatureVisibility().aibridge) &&
		experiments.includes("ai-gateway-cost-control");
	const spendQuery = useQuery({
		...groupMembersAISpend(groupData?.id ?? ""),
		enabled: Boolean(groupData) && aibridgeVisible,
	});
	const aiBudgetColumn: AIBudgetColumn | undefined = aibridgeVisible
		? {
				spendByUserID: new Map(
					spendQuery.data?.map((spend) => [spend.user_id, spend]),
				),
				isLoading: spendQuery.isLoading,
			}
		: undefined;

	useEffect(() => {
		if (spendQuery.error) {
			toast.error(
				getErrorMessage(spendQuery.error, "Unable to load AI budget."),
				{
					description: getErrorDetail(spendQuery.error),
				},
			);
		}
	}, [spendQuery.error]);

	return (
		<div className="flex flex-col w-full gap-1 pb-8">
			<div className="flex flex-row justify-between">
				<UsersFilter {...filterProps} />

				{canUpdateGroup && groupData && !isEveryoneGroup(groupData) && (
					<AddUsersDialog
						organizationId={groupData.organization_id}
						onSubmit={async (users) => {
							await addMembersMutation.mutateAsync({
								groupId: groupData.id,
								userIds: users.map((u) => u.user_id),
							});
						}}
					/>
				)}
			</div>

			<PaginationContainer query={membersQuery} paginationUnitLabel="members">
				<Table aria-label="Group members">
					<TableHeader>
						<TableRow>
							<TableHead className={aiBudgetColumn ? undefined : "w-2/5"}>
								User
							</TableHead>
							<TableHead className={aiBudgetColumn ? undefined : "w-3/5"}>
								Status
							</TableHead>
							{aiBudgetColumn && (
								<>
									<TableHead>AI budget</TableHead>
									<TableHead>Budget type</TableHead>
								</>
							)}
							<TableHead className="w-auto" />
						</TableRow>
					</TableHeader>

					<TableBody>
						{members.length === 0 ? (
							<TableRow>
								<TableCell colSpan={999}>
									<EmptyState message="No members found" />
								</TableCell>
							</TableRow>
						) : (
							members.map((member) => (
								<GroupMemberRow
									member={member}
									group={groupData}
									key={member.id}
									canUpdate={canUpdateGroup}
									aiBudgetColumn={aiBudgetColumn}
									onManageAIBudget={() => setBudgetUser(member)}
									onRemove={async () => {
										const mutation = removeMemberMutation.mutateAsync({
											groupId: groupData.id,
											userId: member.id,
										});
										toast.promise(mutation, {
											loading: `Removing member "${member.username}" from "${groupData.name}"...`,
											success: `Member "${member.username}" has been removed from "${groupData.name}" successfully.`,
											error: (error) => ({
												message: `Failed to remove member "${member.username}" from "${groupData.name}".`,
												description: getErrorDetail(error),
											}),
										});
									}}
								/>
							))
						)}
					</TableBody>
				</Table>
			</PaginationContainer>

			{aibridgeVisible && budgetUser && (
				<UserAIBudgetOverrideDialog
					open
					onOpenChange={(open) => {
						if (!open) {
							setBudgetUser(null);
						}
					}}
					user={budgetUser}
					// TODO(#26401): pass the member's effective group, not the page's
					// group, once the effective-group API exists.
					currentGroup={groupData}
				/>
			)}
		</div>
	);
};

interface AddUsersDialogProps {
	onSubmit: (users: OrganizationMemberWithUserData[]) => Promise<void>;
	organizationId: string;
}

const AddUsersDialog: FC<AddUsersDialogProps> = ({
	onSubmit,
	organizationId,
}) => {
	const [addUserDialogOpen, setAddUserDialogOpen] = useState(false);
	const [submitting, setSubmitting] = useState(false);
	const [filter, setFilter] = useState("");
	const [selected, setSelected] = useState<OrganizationMemberWithUserData[]>(
		[],
	);
	const closeDialog = () => {
		setAddUserDialogOpen(false);
		setFilter("");
		setSelected([]);
	};

	return (
		<>
			<Button size="lg" onClick={() => setAddUserDialogOpen(true)}>
				<UserPlusIcon />
				Add users
			</Button>
			<Dialog
				open={addUserDialogOpen}
				onOpenChange={(open) => {
					if (!open) {
						closeDialog();
					}
				}}
			>
				<DialogContent
					data-testid="dialog"
					className="max-w-md gap-4 border-border-default bg-surface-primary p-8 text-content-primary"
				>
					<DialogTitle className="font-semibold text-content-primary">
						Add user(s)
					</DialogTitle>
					<MultiMemberSelect
						organizationId={organizationId}
						filter={filter}
						setFilter={setFilter}
						onChange={(user, checked) => {
							if (checked) {
								setSelected([...selected, user]);
							} else {
								setSelected(selected.filter((s) => s.user_id !== user.user_id));
							}
						}}
						selected={selected}
					/>
					<DialogFooter className="mt-4 flex-row justify-end gap-3">
						<Button
							variant="outline"
							onClick={closeDialog}
							disabled={submitting}
						>
							Cancel
						</Button>
						<Button
							disabled={submitting || selected.length === 0}
							onClick={async () => {
								try {
									setSubmitting(true);
									await onSubmit(selected);
									closeDialog();
								} catch (error) {
									toast.error(
										getErrorMessage(error, "Failed to add members."),
										{
											description: getErrorDetail(error),
										},
									);
								} finally {
									setSubmitting(false);
								}
							}}
						>
							<Spinner loading={submitting} />
							Add users
						</Button>
					</DialogFooter>
				</DialogContent>
			</Dialog>
		</>
	);
};

interface GroupMemberRowProps {
	member: ReducedUser;
	group: Group;
	canUpdate: boolean;
	aiBudgetColumn: AIBudgetColumn | undefined;
	onManageAIBudget: () => void;
	onRemove: () => void;
}

const GroupMemberRow: FC<GroupMemberRowProps> = ({
	member,
	group,
	canUpdate,
	aiBudgetColumn,
	onManageAIBudget,
	onRemove,
}) => {
	return (
		<TableRow key={member.id}>
			<TableCell width={aiBudgetColumn ? undefined : "59%"}>
				<AvatarData
					avatar={
						<Avatar
							size="lg"
							fallback={member.username}
							src={member.avatar_url}
						/>
					}
					title={member.username}
					subtitle={
						member.is_service_account ? "Service Account" : member.email
					}
				/>
			</TableCell>
			<TableCell
				width={aiBudgetColumn ? undefined : "40%"}
				className={cn(
					"capitalize",
					member.status === "suspended" ? "text-content-secondary" : "",
				)}
			>
				<div>{member.status}</div>
				<LastSeen at={member.last_seen_at} className="text-xs" />
			</TableCell>
			{aiBudgetColumn && (
				<GroupMemberAIBudgetCells
					group={group}
					spend={aiBudgetColumn.spendByUserID.get(member.id)}
					isLoading={aiBudgetColumn.isLoading}
				/>
			)}
			<TableCell className="w-1 whitespace-nowrap">
				{canUpdate && (
					<DropdownMenu>
						<DropdownMenuTrigger asChild>
							<Button size="icon-lg" variant="subtle" aria-label="Open menu">
								<EllipsisVerticalIcon aria-hidden="true" />
								<span className="sr-only">Open menu</span>
							</Button>
						</DropdownMenuTrigger>
						<DropdownMenuContent align="end">
							{aiBudgetColumn && (
								<DropdownMenuItem onClick={onManageAIBudget}>
									AI Budget
								</DropdownMenuItem>
							)}
							<DropdownMenuItem
								className="text-content-destructive focus:text-content-destructive"
								onClick={onRemove}
								disabled={group.id === group.organization_id}
							>
								Remove
							</DropdownMenuItem>
						</DropdownMenuContent>
					</DropdownMenu>
				)}
			</TableCell>
		</TableRow>
	);
};

const GroupMemberAIBudgetCells: FC<{
	group: Group;
	spend: GroupMemberAISpend | undefined;
	isLoading: boolean;
}> = ({ group, spend, isLoading }) => {
	if (isLoading) {
		return (
			<>
				<TableCell>
					<Skeleton variant="text" width="60%" />
				</TableCell>
				<TableCell>
					<Skeleton variant="text" width="40%" />
				</TableCell>
			</>
		);
	}

	if (!spend) {
		return (
			<>
				<TableCell>-</TableCell>
				<TableCell>-</TableCell>
			</>
		);
	}

	const effectiveGroupMatches = spend.effective_group?.id === group.id;

	return (
		<>
			<TableCell className="whitespace-nowrap tabular-nums">
				{formatMemberAISpend(spend, effectiveGroupMatches)}
			</TableCell>
			<TableCell>
				{effectiveGroupMatches ? budgetTypeLabel(spend) : "-"}
			</TableCell>
		</>
	);
};

function formatMemberAISpend(
	spend: GroupMemberAISpend,
	showLimit: boolean,
): string {
	if (!showLimit) {
		return formatBudgetUSD(spend.current_spend_micros);
	}

	return `${formatBudgetUSD(spend.current_spend_micros)} / ${
		spend.spend_limit_micros === null
			? "unlimited"
			: formatBudgetUSD(spend.spend_limit_micros)
	} USD`;
}

function formatBudgetUSD(micros: number): string {
	return usdBudgetFormatter.format(microsToDollars(micros));
}

function budgetTypeLabel(spend: GroupMemberAISpend): string {
	switch (spend.limit_source) {
		case "group":
			return "Group";
		case "override":
			return "Individual";
		case null:
			return "-";
	}
}

export default GroupMembersPage;
