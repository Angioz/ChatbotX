import type {
  BroadcastScheduleType,
  BroadcastSubaction,
  ChannelType,
} from "@chatbotx.io/database/partials"
import type { ContactFilterCriteriaInput } from "@chatbotx.io/database/queries"

export type CreateBroadcastInput = {
  channel: ChannelType
  flowId?: string | null
  templateId?: string | null
  integrationWhatsappId?: string | null
  integrationMessengerId?: string | null
  templateData?: Record<string, unknown> | null
  buttons?: { id: string; label: string; flowId?: string }[]
  subaction: BroadcastSubaction
  schedulesType: BroadcastScheduleType
  schedulesAt: string | Date | null
  contactFilter?: ContactFilterCriteriaInput | null
}

export type UpdateBroadcastInput = {
  name: string
}

export type BroadcastAudienceInput = {
  workspaceId: string
  channels?: ChannelType[] | null
  integrationWhatsappId?: string | null
  integrationMessengerId?: string | null
  contactFilter?: ContactFilterCriteriaInput | null
  subaction?: BroadcastSubaction | null
  restrictToAssignedUserId?: string
}

export type BroadcastAudiencePreviewRow = {
  contactId: string
  contactInboxId: string
  firstName: string | null
  lastName: string | null
  fullName: string | null
  avatar: string | null
  createdAt: Date
  channel: ChannelType
  conversationId: string | null
}

type BroadcastBaseTemplateDetail = {
  id: string
  name: string
  language: string
  category: string
  status: string
  components: unknown
  integrationName: string | null
}

export type BroadcastTemplateDetail =
  | (BroadcastBaseTemplateDetail & {
      channel: "whatsapp"
    })
  | (BroadcastBaseTemplateDetail & {
      channel: "messenger"
      parameterFormat: string
    })
