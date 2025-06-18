"use server"

import { z } from "zod"
import { prisma } from "../../prisma/prisma"
import { createClient } from "../../utils/supabase"

const filterSelectedFieldsSchema = z.object({
  selectedFieldIds: z.array(z.string()).min(1, "At least one field must be selected"),
  searchQuery: z.string().optional(),
  page: z.number().min(1).default(1),
  itemsPerPage: z.number().min(1).max(50).default(15),
})

type FilterSelectedFieldsInput = z.infer<typeof filterSelectedFieldsSchema>

// filteredSelectedFiels using supabase
// This function filters thesis proposals based on selected fields (tags) and an optional search query.
export async function filterSelectedFieldsWithSupabase(input: FilterSelectedFieldsInput) {
  try {
    // Validate input using Zod schema
    const validatedInput = filterSelectedFieldsSchema.safeParse(input)
    if (!validatedInput.success) {
      throw validatedInput.error
    }

    // Proceed with the validated input
    const { selectedFieldIds, searchQuery, page, itemsPerPage } = validatedInput.data

    const supabase = createClient()

    // Pagination
    const from = (page - 1) * itemsPerPage
    const to = from + itemsPerPage - 1

    // Build base query: thesis proposals that have at least one of the selected tags
    let query = supabase
      .from("thesis_proposal")
      .select(`
        thesis_id,
        title,
        description,
        requirements,
        thesis_type,
        application_start,
        application_end,
        supervisor:supervisor_id (
          user_parent:user_id (
            name,
            surname,
            faculty:faculty_id (
              faculty_name
            )
          )
        ),
        thesis_proposal_tag (
          tag:tag_name (
            tag_name
          )
        )
      `, { count: "exact" })
      .order("application_start", { ascending: false })
      .range(from, to)

    // Filter by selected tags (fields)
    if (selectedFieldIds.length > 0) {
      query = query.in("thesis_proposal_tag.tag_name", selectedFieldIds)
    }

    // Add search query if provided
    if (searchQuery && searchQuery.trim()) {
      const search = searchQuery.trim().toLowerCase()
      // Supabase doesn't support complex OR queries easily, so we use ilike on multiple fields
      query = query.or(
        `title.ilike.%${search}%,description.ilike.%${search}%,requirements.ilike.%${search}%,supervisor.user_parent.name.ilike.%${search}%,supervisor.user_parent.surname.ilike.%${search}%,thesis_proposal_tag.tag_name.ilike.%${search}%`
      )
    }

    // Execute query
    const { data, count, error } = await query

    if (error) {
      throw error
    }

    // Format the response to match your existing structure
    const formattedTopics = (data || []).map((proposal: any) => ({
      id: proposal.thesis_id,
      title: proposal.title,
      field: proposal.thesis_proposal_tag?.[0]?.tag?.tag_name || "Unknown",
      description: proposal.description || "",
      professor: {
        name: proposal.supervisor?.user_parent
          ? `${proposal.supervisor.user_parent.name} ${proposal.supervisor.user_parent.surname}`
          : "Unknown",
        department: proposal.supervisor?.user_parent?.faculty?.faculty_name || "Unknown",
      },
      tags: proposal.thesis_proposal_tag?.map((tagRel: any) => tagRel.tag?.tag_name) || [],
      thesis_type: proposal.thesis_type,
      application_start: proposal.application_start,
      application_end: proposal.application_end,
      requirements: proposal.requirements,
    }))

    const totalCount = count || 0
    const totalPages = Math.ceil(totalCount / itemsPerPage)

    return {
      success: true,
      topics: formattedTopics,
      pagination: {
        currentPage: page,
        totalPages,
        totalCount,
        itemsPerPage,
        hasNextPage: page < totalPages,
        hasPreviousPage: page > 1,
      },
      selectedFieldIds,
      appliedFilters: {
        searchQuery: searchQuery || null,
        fieldCount: selectedFieldIds.length,
      },
    }
  } catch (error) {
    console.error("Error filtering selected fields (Supabase):", error)

    if (error instanceof z.ZodError) {
      return {
        success: false,
        error: "Invalid input parameters",
        details: error.errors,
        topics: [],
        pagination: {
          currentPage: 1,
          totalPages: 0,
          totalCount: 0,
          itemsPerPage: 15,
          hasNextPage: false,
          hasPreviousPage: false,
        },
      }
    }

    return {
      success: false,
      error: "Failed to filter topics by selected fields (Supabase)",
      topics: [],
      pagination: {
        currentPage: 1,
        totalPages: 0,
        totalCount: 0,
        itemsPerPage: 15,
        hasNextPage: false,
        hasPreviousPage: false,
      },
    }
  }
}

export async function filterSelectedFields(input: FilterSelectedFieldsInput) {
  try {
    // Validate input
    const validatedInput = filterSelectedFieldsSchema.parse(input)
    const { selectedFieldIds, searchQuery, page, itemsPerPage } = validatedInput

    // Calculate offset for pagination
    const offset = (page - 1) * itemsPerPage

    // Build the where clause for filtering thesis proposals by selected tags
    const whereClause: any = {
      thesis_proposal_tag: {
        some: {
          tag_name: {
            in: selectedFieldIds, // selectedFieldIds are actually tag names
          },
        },
      },
    }

    // Add search query if provided
    if (searchQuery && searchQuery.trim()) {
      const searchTerms = searchQuery.toLowerCase().trim()
      whereClause.OR = [
        {
          title: {
            contains: searchTerms,
            mode: "insensitive",
          },
        },
        {
          description: {
            contains: searchTerms,
            mode: "insensitive",
          },
        },
        {
          requirements: {
            contains: searchTerms,
            mode: "insensitive",
          },
        },
        {
          supervisor: {
            user_parent: {
              name: {
                contains: searchTerms,
                mode: "insensitive",
              },
            },
          },
        },
        {
          supervisor: {
            user_parent: {
              surname: {
                contains: searchTerms,
                mode: "insensitive",
              },
            },
          },
        },
        {
          thesis_proposal_tag: {
            some: {
              tag_name: {
                contains: searchTerms,
                mode: "insensitive",
              },
            },
          },
        },
      ]
    }

    // Get total count for pagination
    const totalCount = await prisma.thesis_proposal.count({
      where: whereClause,
    })

    // Fetch filtered thesis proposals with pagination
    const thesisProposals = await prisma.thesis_proposal.findMany({
      where: whereClause,
      include: {
        supervisor: {
          include: {
            user_parent: {
              select: {
                name: true,
                surname: true,
                faculty: {
                  select: {
                    faculty_name: true,
                  },
                },
              },
            },
          },
        },
        thesis_proposal_tag: {
          include: {
            tag: {
              select: {
                tag_name: true,
              },
            },
          },
        },
      },
      orderBy: {
        application_start: "desc",
      },
      skip: offset,
      take: itemsPerPage,
    })

    // Format the response to match your existing structure
    const formattedTopics = thesisProposals.map((proposal) => ({
      id: proposal.thesis_id,
      title: proposal.title,
      field: proposal.thesis_proposal_tag[0]?.tag.tag_name || "Unknown", // Use first tag as field
      description: proposal.description || "",
      professor: {
        name: proposal.supervisor?.user_parent
          ? `${proposal.supervisor.user_parent.name} ${proposal.supervisor.user_parent.surname}`
          : "Unknown",
        department: proposal.supervisor?.user_parent?.faculty?.faculty_name || "Unknown",
      },
      tags: proposal.thesis_proposal_tag.map((tagRel) => tagRel.tag.tag_name),
      thesis_type: proposal.thesis_type,
      application_start: proposal.application_start,
      application_end: proposal.application_end,
      requirements: proposal.requirements,
    }))

    // Calculate pagination
    const totalPages = Math.ceil(totalCount / itemsPerPage)

    return {
      success: true,
      topics: formattedTopics,
      pagination: {
        currentPage: page,
        totalPages,
        totalCount,
        itemsPerPage,
        hasNextPage: page < totalPages,
        hasPreviousPage: page > 1,
      },
      selectedFieldIds,
      appliedFilters: {
        searchQuery: searchQuery || null,
        fieldCount: selectedFieldIds.length,
      },
    }
  } catch (error) {
    console.error("Error filtering selected fields:", error)

    if (error instanceof z.ZodError) {
      return {
        success: false,
        error: "Invalid input parameters",
        details: error.errors,
        topics: [],
        pagination: {
          currentPage: 1,
          totalPages: 0,
          totalCount: 0,
          itemsPerPage: 15,
          hasNextPage: false,
          hasPreviousPage: false,
        },
      }
    }

    return {
      success: false,
      error: "Failed to filter topics by selected fields",
      topics: [],
      pagination: {
        currentPage: 1,
        totalPages: 0,
        totalCount: 0,
        itemsPerPage: 15,
        hasNextPage: false,
        hasPreviousPage: false,
      },
    }
  }
}

// Helper function to get field names by IDs (tag names in your case)
export async function getFieldNamesByIds(fieldIds: string[]) {
  try {
    const tags = await prisma.tag.findMany({
      where: {
        tag_name: {
          in: fieldIds,
        },
      },
      select: {
        tag_name: true,
      },
    })

    const fieldNames = tags.map((tag) => tag.tag_name)

    return {
      success: true,
      fieldNames,
    }
  } catch (error) {
    console.error("Error getting field names:", error)
    return {
      success: false,
      error: "Failed to get field names",
      fieldNames: [],
    }
  }
}
