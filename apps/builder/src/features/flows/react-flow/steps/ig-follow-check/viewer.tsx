"use client"

import type { IgFollowCheckStepSchema } from "@chatbotx.io/flow-config"
import { stateTypes } from "@chatbotx.io/flow-config"
import { Card, CardContent } from "@chatbotx.io/ui/components/ui/card"
import { UserCheckIcon } from "lucide-react"
import { useTranslations } from "next-intl"
import { BaseStateViewer } from "../../states/viewer"
import { BaseStepViewer } from "../base/viewer"

const IgFollowCheckViewer = ({ data }: { data: IgFollowCheckStepSchema }) => {
  const t = useTranslations()

  return (
    <Card className="overflow-hidden p-0">
      <CardContent className="p-0">
        <div className="px-4 py-2">
          <BaseStepViewer
            icon={UserCheckIcon}
            title={t("flows.actions.igFollowCheck")}
          />
        </div>
        <div className="my-2 mr-3 flex flex-col gap-1">
          {data.states.map((state) => (
            <BaseStateViewer
              data={state}
              key={state.id}
              label={
                state.stateType === stateTypes.success
                  ? t("flows.actions.igFollowCheckFollows")
                  : t("flows.actions.igFollowCheckNotFollows")
              }
            />
          ))}
        </div>
      </CardContent>
    </Card>
  )
}

export default IgFollowCheckViewer
