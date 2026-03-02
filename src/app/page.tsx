import { redirect } from 'next/navigation'

const DEFAULT_COMPANY = 'junestory'

export default function RootPage() {
  redirect(`/${DEFAULT_COMPANY}`)
}
