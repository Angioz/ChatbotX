"use client"

import type { QuestionnairesStepSchema } from "@chatbotx.io/flow-config"
import { Card, CardContent } from "@chatbotx.io/ui/components/ui/card"
import { ClipboardListIcon } from "lucide-react"
import { useTranslations } from "next-intl"
import { BaseStateViewer } from "../../states/viewer"
import { BaseStepViewer } from "../base/viewer"

export function QuestionnairesActionViewer({
  data,
}: {
  data: QuestionnairesStepSchema
}) {
  const t = useTranslations()
  return (
    <Card className="overflow-hidden p-0">
      <CardContent className="p-0">
        <div className="px-4 py-2">
          <BaseStepViewer
            icon={ClipboardListIcon}
            title={t("flows.actions.questionnaires")}
          />
          <div className="mt-1 text-muted-foreground text-xs">
            {t(`questionnaires.flowModes.${data.mode}`)}
          </div>
        </div>
        <div className="my-2 mr-3 flex flex-col gap-1">
          {data.states.map((state) => (
            <BaseStateViewer data={state} key={state.id} />
          ))}
        </div>
      </CardContent>
    </Card>
  )
}
