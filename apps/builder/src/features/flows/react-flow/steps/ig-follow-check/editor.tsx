"use client"

import {
  type IgFollowCheckStepInput,
  type IgFollowCheckStepSchema,
  igFollowCheckStepSchema,
} from "@chatbotx.io/flow-config"
import { SwitchField } from "@chatbotx.io/ui/components/form/switch-field"
import { Button } from "@chatbotx.io/ui/components/ui/button"
import {
  Dialog,
  DialogClose,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@chatbotx.io/ui/components/ui/dialog"
import { Form } from "@chatbotx.io/ui/components/ui/form"
import { zodResolver } from "@hookform/resolvers/zod"
import { UserCheckIcon } from "lucide-react"
import { useTranslations } from "next-intl"
import { useState } from "react"
import { type Resolver, useForm, useFormContext } from "react-hook-form"
import { BaseStepEditor } from "../base/editor"

const IgFollowCheckEditor = ({ parentName }: { parentName: string }) => {
  const t = useTranslations()

  return (
    <BaseStepEditor
      icon={UserCheckIcon}
      title={t("flows.actions.igFollowCheck")}
    >
      <IgFollowCheckDialog parentName={parentName} />
    </BaseStepEditor>
  )
}

const IgFollowCheckDialog = ({ parentName }: { parentName: string }) => {
  const t = useTranslations()
  const [open, setOpen] = useState(false)
  const { setValue, getValues } = useFormContext()

  const form = useForm<IgFollowCheckStepInput, object, IgFollowCheckStepSchema>(
    {
      resolver: zodResolver(igFollowCheckStepSchema) as Resolver<
        IgFollowCheckStepInput,
        object,
        IgFollowCheckStepSchema
      >,
      defaultValues: {
        ...getValues(parentName),
      },
      mode: "onChange",
    },
  )

  const onSubmit = (data: IgFollowCheckStepSchema) => {
    setValue(`${parentName}.recheck`, data.recheck)
    setOpen(false)
  }

  return (
    <Dialog onOpenChange={setOpen} open={open}>
      <DialogTrigger asChild>
        <div className="flex justify-center">
          <Button size="sm" type="button" variant="outline">
            {t("actions.edit")}
          </Button>
        </div>
      </DialogTrigger>
      <DialogContent className={"max-h-screen max-w-lg overflow-y-scroll"}>
        <DialogHeader>
          <DialogTitle>{t("flows.actions.igFollowCheck")}</DialogTitle>
          <DialogDescription />
        </DialogHeader>

        <Form {...form}>
          <form
            className="flex w-full flex-col gap-4"
            onSubmit={form.handleSubmit(onSubmit)}
          >
            <SwitchField
              description={t("fields.igFollowCheckRecheck.description")}
              label={t("fields.igFollowCheckRecheck.label")}
              name="recheck"
            />

            <DialogFooter>
              <DialogClose asChild>
                <Button variant="outline">{t("actions.cancel")}</Button>
              </DialogClose>

              <Button
                disabled={
                  !form.formState.isValid || form.formState.isSubmitting
                }
                type="submit"
              >
                {t("actions.save")}
              </Button>
            </DialogFooter>
          </form>
        </Form>
      </DialogContent>
    </Dialog>
  )
}

export default IgFollowCheckEditor
