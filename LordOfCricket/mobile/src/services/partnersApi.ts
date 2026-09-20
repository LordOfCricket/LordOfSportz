import api from './api'

export interface Partner {
  id: number
  name: string
  logo_url: string
  website_url?: string | null
}

/**
 * GET /partners
 * Public — only active/visible sponsors, same data the website's
 * SponsorsSection uses.
 */
export async function getPartners(): Promise<Partner[]> {
  const response = await api.get<Partner[]>('/partners')
  return response.data
}
