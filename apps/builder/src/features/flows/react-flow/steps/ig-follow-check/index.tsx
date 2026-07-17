import {
  type IgFollowCheckStepSchema,
  igFollowCheckStepDefaultFn,
  igFollowCheckStepSchema,
} from "@chatbotx.io/flow-config"
import type { StepDefinition } from "../definition"
import IgFollowCheckEditor from "./editor"
import IgFollowCheckViewer from "./viewer"

export const igFollowCheckStep: StepDefinition<IgFollowCheckStepSchema> = {
  editor: IgFollowCheckEditor,
  viewer: IgFollowCheckViewer,
  validator: igFollowCheckStepSchema,
  defaultFn: igFollowCheckStepDefaultFn,
}
