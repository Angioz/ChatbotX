"use client"

import { DataTable } from "@chatbotx.io/ui/components/data-table/data-table"
import { DataTableColumnHeader } from "@chatbotx.io/ui/components/data-table/data-table-column-header"
import { DataTableToolbar } from "@chatbotx.io/ui/components/data-table/data-table-toolbar"
import {
  Avatar,
  AvatarFallback,
  AvatarImage,
} from "@chatbotx.io/ui/components/ui/avatar"
import { Badge } from "@chatbotx.io/ui/components/ui/badge"
import { Button } from "@chatbotx.io/ui/components/ui/button"
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
} from "@chatbotx.io/ui/components/ui/card"
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@chatbotx.io/ui/components/ui/dropdown-menu"
import { useDataTable } from "@chatbotx.io/ui/hooks/use-data-table"
import { formatDate } from "@chatbotx.io/ui/lib/format"
import type { ColumnDef } from "@tanstack/react-table"
import { EllipsisVerticalIcon, Trash2Icon } from "lucide-react"
import { useLocale, useTranslations } from "next-intl"
import { useAction } from "next-safe-action/hooks"
import { use, useMemo, useState } from "react"
import { getQuestionnaireSubmissionDetailAction } from "../actions/get-questionnaire-submission-detail.action"
import type { listQuestionnaireSubmissions } from "../queries"
import { ApplicantDetailModal } from "./applicant-detail-modal"
import { DeleteApplicantSubmissionDialog } from "./delete-applicant-submission-dialog"

type ListResult = Awaited<ReturnType<typeof listQuestionnaireSubmissions>>
type DetailResult = NonNullable<
  Awaited<ReturnType<typeof getQuestionnaireSubmissionDetailAction>>["data"]
>
type Submission = ListResult["data"][number]

type Props = {
  workspaceId: string
  questionnaireId: string
  promises: Promise<[ListResult]>
}

export function QuestionnaireApplicantsTable({
  workspaceId,
  questionnaireId,
  promises,
}: Props) {
  const t = useTranslations()
  const locale = useLocale()
  const [{ data, pageCount, enableScore }] = use(promises)
  const [detail, setDetail] = useState<DetailResult | null>(null)
  const [deleteId, setDeleteId] = useState<string | null>(null)
  const { execute: loadDetail } = useAction(
    getQuestionnaireSubmissionDetailAction.bind(null, workspaceId),
    {
      onSuccess: ({ data }) => {
        if (data) {
          setDetail(data)
        }
      },
    },
  )
  const columns = useMemo<ColumnDef<Submission>[]>(
    () => [
      {
        id: "name",
        accessorKey: "name",
        header: ({ column }) => (
          <DataTableColumnHeader
            column={column}
            title={t("fields.name.label")}
          />
        ),
        cell: ({ row }) => {
          const name =
            row.original.contact.fullName ?? t("questionnaires.unknownContact")
          return (
            <button
              className="flex items-center gap-2 text-left"
              onClick={() =>
                loadDetail({
                  questionnaireId,
                  submissionId: row.original.id,
                })
              }
              type="button"
            >
              <Avatar className="size-8">
                <AvatarImage src={row.original.contact.avatar ?? undefined} />
                <AvatarFallback>{name.slice(0, 2)}</AvatarFallback>
              </Avatar>
              <span className="font-medium">{name}</span>
            </button>
          )
        },
        meta: {
          label: t("fields.name.label"),
          placeholder: t("fields.name.searchPlaceholder"),
          variant: "text",
        },
        enableColumnFilter: true,
      },
      ...(enableScore
        ? [
            {
              id: "totalPoints",
              accessorKey: "totalPoints",
              header: ({ column }) => (
                <DataTableColumnHeader
                  column={column}
                  title={t("questionnaires.points")}
                />
              ),
              cell: ({ row }) => row.original.totalPoints ?? 0,
            } satisfies ColumnDef<Submission>,
          ]
        : []),
      {
        id: "status",
        accessorKey: "status",
        header: ({ column }) => (
          <DataTableColumnHeader
            column={column}
            title={t("fields.status.label")}
          />
        ),
        cell: ({ row }) => (
          <Badge variant="secondary">
            {t(`questionnaires.status.${row.original.status}`)}
          </Badge>
        ),
      },
      {
        id: "date",
        accessorKey: "completedAt",
        header: ({ column }) => (
          <DataTableColumnHeader
            column={column}
            title={t("questionnaires.date")}
          />
        ),
        cell: ({ row }) =>
          row.original.completedAt
            ? formatDate(row.original.completedAt, { locale })
            : "",
      },
      {
        id: "actions",
        cell: ({ row }) => (
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button className="size-8 p-0" variant="ghost">
                <EllipsisVerticalIcon className="size-4" />
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end">
              <DropdownMenuItem
                onSelect={() => setDeleteId(row.original.id)}
                variant="destructive"
              >
                <Trash2Icon />
                {t("actions.delete")}
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
        ),
      },
    ],
    [enableScore, loadDetail, locale, questionnaireId, t],
  )
  const { table } = useDataTable({
    data,
    columns,
    pageCount,
    getRowId: (row) => row.id,
    shallow: false,
    clearOnDefault: true,
  })

  return (
    <Card>
      <CardHeader>
        <CardTitle>{t("questionnaires.applicants")}</CardTitle>
      </CardHeader>
      <CardContent>
        <DataTable table={table}>
          <DataTableToolbar table={table} />
        </DataTable>
        <ApplicantDetailModal
          detail={detail}
          enableScore={enableScore}
          onOpenChange={(open) => {
            if (!open) {
              setDetail(null)
            }
          }}
          open={Boolean(detail)}
          workspaceId={workspaceId}
        />
        <DeleteApplicantSubmissionDialog
          onOpenChange={(open) => {
            if (!open) {
              setDeleteId(null)
            }
          }}
          open={Boolean(deleteId)}
          questionnaireId={questionnaireId}
          submissionId={deleteId}
          workspaceId={workspaceId}
        />
      </CardContent>
    </Card>
  )
}
