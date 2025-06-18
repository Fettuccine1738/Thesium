"use server"

import { create } from "domain"
import { prisma } from "../../prisma/prisma"
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

export async function getProfessors(page = 1, limit = 10, searchQuery?: string): Promise<PaginatedProfessorsResponse> {
  try {
    // Calculate offset
    const offset = (page - 1) * limit

    // Build where clause for search
    const whereClause = searchQuery?.trim()
      ? {
          user_parent: {
            OR: [
              {
                name: {
                  contains: searchQuery.trim(),
                  mode: "insensitive" as const,
                },
              },
              {
                surname: {
                  contains: searchQuery.trim(),
                  mode: "insensitive" as const,
                },
              },
              {
                faculty: {
                  faculty_name: {
                    contains: searchQuery.trim(),
                    mode: "insensitive" as const,
                  },
                },
              },
            ],
          },
        }
      : {}

    // Get total count
    const totalCount = await prisma.supervisor.count({
      where: whereClause,
    })

    // Get paginated results
    const professors = await prisma.supervisor.findMany({
      where: whereClause,
      select: {
        supervisor_id: true,
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
      orderBy: {
        user_parent: {
          surname: "asc",
        },
      },
      skip: offset,
      take: limit,
    })

    const formattedProfessors: Professor[] = professors.map((prof) => ({
      id: prof.supervisor_id.toString(),
      name: `${prof.user_parent?.name || ""} ${prof.user_parent?.surname || ""}`.trim(),
      department: prof.user_parent?.faculty?.faculty_name || "Not specified",
    }))

    const totalPages = Math.ceil(totalCount / limit)

    return {
      success: true,
      professors: formattedProfessors,
      totalCount,
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
