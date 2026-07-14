"use client"

import {
  type QuestionnairesStepSchema,
  questionnaireActionModes,
  questionnairesStepSchema,
} from "@chatbotx.io/flow-config"
import { ComboboxField } from "@chatbotx.io/ui/components/form/combobox-field"
import { SelectField } from "@chatbotx.io/ui/components/form/select-field"
import { Button } from "@chatbotx.io/ui/components/ui/button"
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@chatbotx.io/ui/components/ui/dialog"
import { Form } from "@chatbotx.io/ui/components/ui/form"
import { zodResolver } from "@hookform/resolvers/zod"
import { useTranslations } from "next-intl"
import { useAction } from "next-safe-action/hooks"
import { useEffect, useMemo, useState } from "react"
import type { Resolver, SubmitHandler } from "react-hook-form"
import { useForm, useFormContext, useWatch } from "react-hook-form"
import { listQuestionnairesForFlowAction } from "@/features/questionnaires/actions/list-questionnaires-for-flow.action"
import { useWorkspaceId } from "@/hooks/routing"

export function QuestionnairesActionEditor({
  parentName,
}: {
  parentName: string
}) {
  const t = useTranslations()
  const workspaceId = useWorkspaceId().toString()
  const { getValues, setValue } = useFormContext()
  const [open, setOpen] = useState(false)
  const [options, setOptions] = useState<{ label: string; value: string }[]>([])
  const form = useForm<QuestionnairesStepSchema>({
    resolver: zodResolver(
      questionnairesStepSchema,
    ) as Resolver<QuestionnairesStepSchema>,
    defaultValues: getValues(parentName),
    mode: "onChange",
  })
  const mode = useWatch({ control: form.control, name: "mode" })
  const { execute } = useAction(
    listQuestionnairesForFlowAction.bind(null, workspaceId),
    {
      onSuccess: ({ data }) => {
        setOptions(
          (data ?? []).map((item) => ({
            label: item.name,
            value: item.id,
          })),
        )
      },
    },
  )

  useEffect(() => {
    if (open) {
      execute({ activeOnly: mode === "start" })
    }
  }, [execute, mode, open])

  const modeOptions = useMemo(
    () =>
      questionnaireActionModes.options.map((value) => ({
        value,
        label: t(`questionnaires.flowModes.${value}`),
      })),
    [t],
  )

  const onSubmit: SubmitHandler<QuestionnairesStepSchema> = (values) => {
    setValue(`${parentName}.mode`, values.mode)
    setValue(`${parentName}.questionnaireId`, values.questionnaireId)
    setOpen(false)
  }

  return (
    <Dialog onOpenChange={setOpen} open={open}>
      <DialogTrigger asChild>
        <div className="rounded-lg border-2 border-dashed p-4 text-sm">
          {t("flows.actions.questionnaires")}
        </div>
      </DialogTrigger>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>{t("flows.actions.questionnaires")}</DialogTitle>
        </DialogHeader>
        <Form {...form}>
          <form
            className="flex flex-col gap-4"
            onSubmit={form.handleSubmit(onSubmit)}
          >
            <SelectField
              label={t("questionnaires.mode")}
              name="mode"
              options={modeOptions}
              required
            />
            <ComboboxField
              emptyText={t("actions.noRecordFound")}
              label={t("questionnaires.singular")}
              name="questionnaireId"
              options={options}
              placeholder={t("actions.pleaseSelect")}
              required
            />
            <div className="flex justify-end gap-2">
              <Button
                onClick={() => setOpen(false)}
                type="button"
                variant="ghost"
              >
                {t("actions.cancel")}
              </Button>
              <Button disabled={!form.formState.isValid} type="submit">
                {t("actions.continue")}
              </Button>
            </div>
          </form>
        </Form>
      </DialogContent>
    </Dialog>
  )
}
