import { redirect } from 'next/navigation'

const DEFAULT_COMPANY = 'junestry'

export default function RootPage() {
  redirect(`/${DEFAULT_COMPANY}`)
}
