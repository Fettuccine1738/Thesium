"use server"

import { createClient } from "../../utils/server"

export type Professor = {
  id: string
  name: string
  department: string
}

export interface PaginatedProfessorsResponse {
  success: boolean
  professors: Professor[]
  totalCount: number
  totalPages: number
  currentPage: number
  message?: string
}

export async function getProfessors(
  page = 1, 
  limit = 10, 
  searchQuery?: string
): Promise<PaginatedProfessorsResponse> {
  try {
    const supabase = await createClient()
    const offset = (page - 1) * limit

    // Build the base query with joins
    let query = supabase
      .from('supervisor')
      .select(`
        supervisor_id,
        user_parent!inner (
          name,
          surname,
          faculty!inner (
            faculty_name
          )
        )
      `)

    // Add search conditions if searchQuery is provided
    if (searchQuery?.trim()) {
      const searchTerm = searchQuery.trim()
      query = query.or(
        `user_parent.name.ilike.%${searchTerm}%,user_parent.surname.ilike.%${searchTerm}%,user_parent.faculty.faculty_name.ilike.%${searchTerm}%`
      )
    }

    // Get total count for pagination
    const { count: totalCount, error: countError } = await supabase
      .from('supervisor')
      .select('supervisor_id', { count: 'exact', head: true })
      .then(async (result) => {
        if (searchQuery?.trim()) {
          const searchTerm = searchQuery.trim()
          return await supabase
            .from('supervisor')
            .select(`
              supervisor_id,
              user_parent!inner (
                name,
                surname,
                faculty!inner (
                  faculty_name
                )
              )
            `, { count: 'exact', head: true })
            .or(
              `user_parent.name.ilike.%${searchTerm}%,user_parent.surname.ilike.%${searchTerm}%,user_parent.faculty.faculty_name.ilike.%${searchTerm}%`
            )
        }
        return result
      })

    if (countError) {
      throw countError
    }

    // Get paginated results with ordering
    const { data: professors, error } = await query
      .order('user_parent.surname', { ascending: true })
      .range(offset, offset + limit - 1)

    if (error) {
      throw error
    }

    // Format the results to match the expected Professor type
    const formattedProfessors: Professor[] = (professors || []).map((prof: any) => ({
      id: prof.supervisor_id.toString(),
      name: `${prof.user_parent?.name || ""} ${prof.user_parent?.surname || ""}`.trim(),
      department: prof.user_parent?.faculty?.faculty_name || "Not specified",
    }))

    const totalPages = Math.ceil((totalCount || 0) / limit)

    return {
      success: true,
      professors: formattedProfessors,
      totalCount: totalCount || 0,
      totalPages,
      currentPage: page,
    }
  } catch (error) {
    console.error("Error fetching professors:", error)
    return {
      success: false,
      message: "Failed to fetch professors",
      professors: [],
      totalCount: 0,
      totalPages: 0,
      currentPage: page,
    }
  }
}