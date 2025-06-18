'use server'

import { prisma } from '../../prisma/prisma'
import { createClient } from '../../utils/server'

export type Professor = {
  id: string
  name: string
  department: string
}

export async function getProfessors() {
  try {
    const professors = await prisma.supervisor.findMany({
      select: {
        supervisor_id: true,
        user_parent: {
          select: {
            name: true,
            surname: true,
            faculty: {
              select: {
                faculty_name: true
              }
            }
          }
        }
      },
      orderBy: {
        user_parent: {
          surname: 'asc'
        }
      }
    })

     const formattedProfessors: Professor[] = professors.map((prof) => {
       const userParent = Array.isArray(prof.user_parent) ? prof.user_parent[0] : prof.user_parent;
       const faculty = userParent?.faculty && Array.isArray(userParent.faculty) ? userParent.faculty[0] : userParent?.faculty;
       const facultyObj = Array.isArray(faculty) ? faculty[0] : faculty;
       return {
         id: prof.supervisor_id.toString(),
         name: `${userParent?.name || ''} ${userParent?.surname || ''}`.trim(),
         department: facultyObj?.faculty_name || 'Not specified'
       };
     })

    return { success: true, professors: formattedProfessors }
  } catch (error) {
    console.error('Error fetching professors:', error)
    return { success: false, message: 'Failed to fetch professors', professors: [] }
  }
}


// replicate getProfessors using supabase
export async function getProfessorsWs(): Promise<{ success: boolean; professors: Professor[]; message?: string }> {
   try {
     const supabaseClient = await createClient()
     const { data: professors, error } = await supabaseClient
       .from('supervisor')
       .select(`
         supervisor_id,
         user_parent (
           name,
           surname,
           faculty (
             faculty_name
           )
         )
       `)

     if (error) {
       throw error
     }

     const formattedProfessors: Professor[] = professors.map((prof) => {
       const userParent = Array.isArray(prof.user_parent) ? prof.user_parent[0] : prof.user_parent;
       const faculty = userParent?.faculty && Array.isArray(userParent.faculty) ? userParent.faculty[0] : userParent?.faculty;
       const facultyObj = Array.isArray(faculty) ? faculty[0] : faculty;
       return {
         id: prof.supervisor_id.toString(),
         name: `${userParent?.name || ''} ${userParent?.surname || ''}`.trim(),
         department: facultyObj?.faculty_name || 'Not specified'
       };
     })

     return { success: true, professors: formattedProfessors }
   } catch (error) {
     console.error('Error fetching professors (Supabase):', error)
     return { success: false, professors: [], message: 'Failed to fetch professors' }
   }
}