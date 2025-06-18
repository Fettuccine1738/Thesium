"use server"

import { create } from "domain"
import { prisma } from "../../prisma/prisma"
import { createClient } from "../../utils/server"

export type Field = {
  id: string
  name: string
  slug: string
}

export interface PaginatedFieldsResponse {
  success: boolean
  fields: Field[]
  totalCount: number
  totalPages: number
  currentPage: number
  message?: string
}

export async function getFieldsFromTags(page = 1, limit = 10, searchQuery?: string): Promise<PaginatedFieldsResponse> {
  try {
    // Calculate offset
    const offset = (page - 1) * limit

    // Build where clause for search
    const whereClause = searchQuery?.trim()
      ? {
          tag_name: {
            contains: searchQuery.trim(),
            mode: "insensitive" as const,
          },
        }
      : {}

    // Get total count
    const totalCount = await prisma.tag.count({
      where: whereClause,
    })

    // Get paginated results
    const tags = await prisma.tag.findMany({
      where: whereClause,
      select: {
        tag_name: true,
      },
      orderBy: {
        tag_name: "asc",
      },
      skip: offset,
      take: limit,
    })

    const formattedFields: Field[] = (tags ?? []).map((tag) => ({
      id: tag.tag_name,
      name: tag.tag_name,
      slug: tag.tag_name.toLowerCase().replace(/\s+/g, "-"),
    }))

    const safeTotalCount = totalCount ?? 0
    const totalPages = Math.ceil(safeTotalCount / limit)

    return {
      success: true,
      fields: formattedFields,
      totalCount: safeTotalCount,
      totalPages,
      currentPage: page,
    }
  } catch (error) {
    console.error("Error fetching fields from tags:", error)
    return {
      success: false,
      message: "Failed to fetch fields",
      fields: [],
      totalCount: 0,
      totalPages: 0,
      currentPage: page,
    }
  }
}


// replicate logic using supabase
export async function getFieldsFromTagsWs(page = 1, limit = 10, searchQuery?: string): Promise<PaginatedFieldsResponse> {
  const supabaseClient = await createClient()
  try {
    // Calculate offset
    const offset = (page - 1) * limit

    // Build where clause for search
    const whereClause = searchQuery?.trim()
      ? {
          tag_name: {
            contains: searchQuery.trim(),
            mode: "insensitive" as const,
          },
        }
      : {}

    // Get total count
    const { count: totalCount } = await supabaseClient
      .from("tag")
      .select("id", { count: "exact", head: false })
      .match(whereClause)

    // Get paginated results
    const { data: tags } = await supabaseClient
      .from("tag")
      .select("tag_name")
      .match(whereClause)
      .order("tag_name", { ascending: true })
      .range(offset, offset + limit - 1)

    const formattedFields: Field[] = tags.map((tag) => ({
      id: tag.tag_name,
      name: tag.tag_name,
      slug: tag.tag_name.toLowerCase().replace(/\s+/g, "-"),
    }))

    const safeTotalCount = totalCount ?? 0
    const totalPages = Math.ceil(safeTotalCount / limit)

    return {
      success: true,
      fields: formattedFields,
      totalCount: safeTotalCount,
      totalPages,
      currentPage: page,
    }
  } catch (error) {
    console.error("Error fetching fields from tags (Supabase):", error)
    return {
      success: false,
      message: "Failed to fetch fields",
      fields: [],
      totalCount: 0,
      totalPages: 0,
      currentPage: page,
    }
  }
}