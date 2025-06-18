"use server"

import { createClient } from "../../utils/server"

export type Topic = {
  id: string
  title: string
  field: string
  description: string
  professor: {
    name: string
    department: string
  }
  tags: string[]
}

export interface PaginatedTopicsResponse {
  success: boolean
  topics: Topic[]
  totalCount: number
  totalPages: number
  currentPage: number
  message?: string
}

// Type for recommendation items from the API
interface RecommendationItem {
  id: string
  score?: number
  // Add other fields as needed based on your API response
}

// Type for the recommendations API response
interface RecommendationsResponse {
  theses: RecommendationItem[]
  // Add other fields as needed based on your API response
}

export async function getTopics(
  searchQuery?: string,
  page = 1,
  limit = 10,
  studentId?: string,
): Promise<PaginatedTopicsResponse> {
  try {
    const supabase = await createClient()
    const offset = (page - 1) * limit

    // Build the base query with all necessary joins
    let baseQuery = supabase
      .from('thesis_proposal')
      .select(`
        thesis_id,
        title,
        description,
        thesis_type,
        supervisor!inner (
          user_parent!inner (
            name,
            surname,
            faculty!inner (
              faculty_name
            )
          )
        ),
        thesis_proposal_tag (
          tag!inner (
            tag_name
          )
        )
      `)

    // Add search conditions if searchQuery is provided
    if (searchQuery?.trim()) {
      const searchTerm = searchQuery.trim()
      baseQuery = baseQuery.or(
        `title.ilike.%${searchTerm}%,description.ilike.%${searchTerm}%,thesis_proposal_tag.tag.tag_name.ilike.%${searchTerm}%`
      )
    }

    // Get total count for pagination
    let countQuery = supabase
      .from('thesis_proposal')
      .select('thesis_id', { count: 'exact', head: true })

    if (searchQuery?.trim()) {
      const searchTerm = searchQuery.trim()
      countQuery = countQuery.or(
        `title.ilike.%${searchTerm}%,description.ilike.%${searchTerm}%,thesis_proposal_tag.tag.tag_name.ilike.%${searchTerm}%`
      )
    }

    const { count: totalCount, error: countError } = await countQuery
    if (countError) throw countError

    // Get paginated results with ordering
    const { data: thesisProposals, error } = await baseQuery
      .order('title', { ascending: true })
      .range(offset, offset + limit - 1)

    if (error) throw error

    // Format the basic topics
    const formattedTopics: Topic[] = (thesisProposals || []).map((thesis: any) => {
      const tags = thesis.thesis_proposal_tag?.map((t: any) => t.tag.tag_name) || []
      const field = tags[0] || thesis.thesis_type
      const user = thesis.supervisor?.user_parent

      return {
        id: thesis.thesis_id,
        title: thesis.title,
        field,
        description: thesis.description || "No description provided",
        professor: {
          name: `${user?.name ?? ""} ${user?.surname ?? ""}`.trim(),
          department: user?.faculty?.faculty_name || "Not specified",
        },
        tags,
      }
    })

    // Handle recommendations if studentId provided (only for first page)
    let finalTopics = formattedTopics
    const adjustedTotalCount = totalCount || 0

    if (studentId && page === 1) {
      try {
        // Fetch all thesis proposals for recommendations (not paginated)
        let allThesesQuery = supabase
          .from('thesis_proposal')
          .select(`
            thesis_id,
            title,
            description,
            thesis_type,
            supervisor!inner (
              user_parent!inner (
                name,
                surname,
                faculty!inner (
                  faculty_name
                )
              )
            ),
            thesis_proposal_tag (
              tag!inner (
                tag_name
              )
            )
          `)
          .order('title', { ascending: true })

        // Apply same search filter for recommendations
        if (searchQuery?.trim()) {
          const searchTerm = searchQuery.trim()
          allThesesQuery = allThesesQuery.or(
            `title.ilike.%${searchTerm}%,description.ilike.%${searchTerm}%,thesis_proposal_tag.tag.tag_name.ilike.%${searchTerm}%`
          )
        }

        const { data: allThesisProposals, error: allThesesError } = await allThesesQuery
        if (allThesesError) throw allThesesError

        // Fetch recommendations
        const res = await fetch(`${process.env.NEXT_PUBLIC_BASE_URL}/api/recommendations?studentId=${studentId}`, {
          cache: "no-store",
        })

        if (res.ok) {
          const data: RecommendationsResponse = await res.json()
          const recommendations = data.theses || []

          // Map recommendations to Topic format
          const recommendedTopics: Topic[] = recommendations
            .map((rec: RecommendationItem) => {
              const thesis = allThesisProposals?.find((t: any) => t.thesis_id === rec.id)
              if (!thesis) return null

              const tags = thesis.thesis_proposal_tag?.map((t: any) => t.tag.tag_name) || []
              const user = thesis.supervisor?.user_parent

              return {
                id: thesis.thesis_id,
                title: thesis.title,
                field: tags[0] || thesis.thesis_type,
                description: thesis.description || "No description provided",
                professor: {
                  name: `${user?.name ?? ""} ${user?.surname ?? ""}`.trim(),
                  department: user?.faculty?.faculty_name || "Not specified",
                },
                tags,
              }
            })
            .filter((topic: Topic | null): topic is Topic => topic !== null)

          // Remove recommended topics from the normal list to avoid duplicates
          const recommendedIds = new Set(recommendedTopics.map((r) => r.id))
          const remainingTopics = formattedTopics.filter((topic) => !recommendedIds.has(topic.id))

          // For first page, show recommendations first, then fill with remaining topics
          const availableSlots = limit - recommendedTopics.length
          const topicsToShow = availableSlots > 0 ? remainingTopics.slice(0, availableSlots) : []

          finalTopics = [...recommendedTopics, ...topicsToShow]
        }
      } catch (err) {
        console.error("Failed to fetch recommendations:", err)
        // Fall back to normal topics if recommendations fail
      }
    }

    const totalPages = Math.ceil(adjustedTotalCount / limit)

    return {
      success: true,
      topics: finalTopics,
      totalCount: adjustedTotalCount,
      totalPages,
      currentPage: page,
    }
  } catch (error) {
    console.error("Error fetching topics:", error)
    return {
      success: false,
      message: "Failed to fetch topics",
      topics: [],
      totalCount: 0,
      totalPages: 0,
      currentPage: page,
    }
  }
}