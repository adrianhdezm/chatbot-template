import type { Route } from "./+types/home"
import { getAvailableModels } from "@/lib/models.server"
import { Chat } from "@/components/chat"

export function meta(): Route.MetaDescriptors {
  return [
    { title: "Chat" },
    {
      name: "description",
      content:
        "A chatbot template built using React Router, shadcn/ui, shadcn/react and shadcn/typeset, powered by the Vercel AI Gateway.",
    },
  ]
}

export function loader() {
  return { models: getAvailableModels() }
}

export default function Home({ loaderData }: Route.ComponentProps) {
  return <Chat models={loaderData.models} />
}
