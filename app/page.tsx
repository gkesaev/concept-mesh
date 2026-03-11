import { MeshCanvas } from '@/components/canvas/MeshCanvas'
import { ConceptModal } from '@/components/concept/ConceptModal'
import { SerendipityBanner } from '@/components/serendipity/SerendipityBanner'
import { UserMenu } from '@/components/auth/UserMenu'
import type { MeshData } from '@/types/concept'

async function getMeshData(): Promise<MeshData> {
  const baseUrl = process.env.NEXT_PUBLIC_APP_URL ?? 'http://localhost:3000'
  try {
    const res = await fetch(`${baseUrl}/api/mesh`, { cache: 'no-store' })
    if (!res.ok) throw new Error('Failed to fetch mesh data')
    return res.json()
  } catch {
    // Return empty mesh if DB isn't ready yet
    return { concepts: [], connections: [], positions: [] }
  }
}

export default async function Home() {
  const meshData = await getMeshData()

  return (
    <main style={{ width: '100vw', height: '100vh', overflow: 'hidden', background: '#0a0f1e' }}>
      <div className="absolute top-4 right-4 z-50">
        <UserMenu />
      </div>
      <MeshCanvas initialData={meshData} />
      <ConceptModal />
      <SerendipityBanner />
    </main>
  )
}
