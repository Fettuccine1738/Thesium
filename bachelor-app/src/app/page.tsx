"use client"

import { useEffect, useState, useCallback, useRef, useMemo } from "react"
import { useRouter, useSearchParams } from "next/navigation"
import { Search, ChevronRight, User, Check, X, ChevronDown } from "lucide-react"
import Link from "next/link"
import { Button } from "@/components/ui/button"
import { Badge } from "@/components/ui/badge"
import { filterSelectedFields } from "./backend/actions/fields/filter-selected-fields"
import { useMediaQuery } from "@/hooks/use-media-query"
import { useDebouncedValue } from "@/hooks/use-debounced-value"
import { useDataCache } from "@/hooks/use-data-cache"
import { useFilterOnClient } from "@/hooks/useFilteredResults"
import { Pagination } from "@/components/pagination"
import { FieldsSkeleton, ProfessorsSkeleton, TopicsSkeleton } from "@/components/skeleton-loading"
import { getFieldsFromTags } from "./backend/actions/fields/get-fields"
import { getProfessors } from "./backend/actions/professors/get-professors"
import { getTopics } from "./backend/actions/topics/get-topics"

type Field = {
  id: string
  name: string
  slug: string
}

type Professor = {
  id: string
  name: string
  department: string
}

type Topic = {
  id: string
  title: string
  field: string
  description: string
  professor: {
    name: string
    department: string
  }
  tags: string[]
  thesis_type?: string
  application_start?: Date | null
  application_end?: Date | null
  requirements?: string | null
}

type Tab = "fields" | "professors" | "list"

export default function Home() {
  const router = useRouter()
  const searchParams = useSearchParams()
  const isDesktop = useMediaQuery("(min-width: 1024px)")
  const isMobile = useMediaQuery("(max-width: 768px)")
  const isTablet = useMediaQuery("(min-width: 769px) and (max-width: 1024px)")

  const tabsRef = useRef<HTMLDivElement>(null)
  const indicatorRef = useRef<HTMLDivElement>(null)
  const abortControllerRef = useRef<AbortController | null>(null)

  // Get URL parameters
  const activeTab = searchParams.get("tab") || "fields"
  const tab = (searchParams.get("tab") as Tab) || "fields"
  const currentPage = Number.parseInt(searchParams.get("page") || "1")
  const searchQuery = searchParams.get("search") || ""
  const filters = searchParams.getAll("filter")
  const selectedFieldIds = searchParams.getAll("fieldId") // New parameter for field IDs

  // Debounce search query to prevent excessive API calls
  const debouncedSearchQuery = useDebouncedValue(searchQuery, 300)

  // Data caching hooks - stable across renders
  const fieldsCache = useDataCache<any>("fields", 2 * 60 * 1000)
  const professorsCache = useDataCache<any>("professors", 2 * 60 * 1000)
  const topicsCache = useDataCache<any>("topics", 1 * 60 * 1000)
  const filteredTopicsCache = useDataCache<any>("filtered-topics", 1 * 60 * 1000)

  // State
  const [expandedTopic, setExpandedTopic] = useState<number | null>(null)
  const [fields, setFields] = useState<Field[]>([])
  const [filteredFields, setFilteredFields] = useState<Field[]>([])
  const [professors, setProfessors] = useState<Professor[]>([])
  const [filteredProfessors, setFilteredProfessors] = useState<Professor[]>([])
  const [topics, setTopics] = useState<Topic[]>([])
  const [filteredTopics, setFilteredTopics] = useState<Topic[]>([])
  const [isLoading, setIsLoading] = useState(true)
  const [pagination, setPagination] = useState({
    totalPages: 0,
    totalCount: 0,
    currentPage: 1,
  })

  // Multi-select fields functionality
  const [isMultiSelectMode, setIsMultiSelectMode] = useState(false)
  const [selectedFields, setSelectedFields] = useState<Set<string>>(new Set())
  const [selectionLimitReached, setSelectionLimitReached] = useState(false)
  const MAX_FIELD_SELECTIONS = 5

  // Filter display state for list tab
  const [showAllFilters, setShowAllFilters] = useState(false)
  const visibleFilterCount = isMobile ? 1 : isDesktop ? 3 : 2
  const hasHiddenFilters = filters.length > visibleFilterCount

  // Check if we're in filtered mode (selected fields from URL)
  const isFilteredMode = selectedFieldIds.length > 0

  // Stable items per page calculation
  const itemsPerPage = useMemo(() => {
    if (isDesktop) {
      return activeTab === "fields" ? 12 : 15
    } else if (isTablet) {
      return activeTab === "fields" ? 9 : 10
    }
    return activeTab === "fields" ? 6 : 8
  }, [isDesktop, isTablet, activeTab])

  // Stable cache key
  const cacheKey = useMemo(() => {
    const searchKey = debouncedSearchQuery || "no-search"
    const filtersKey = filters.length > 0 ? filters.sort().join(",") : "no-filters"
    const fieldIdsKey = selectedFieldIds.length > 0 ? selectedFieldIds.sort().join(",") : "no-field-ids"
    return `${activeTab}-${currentPage}-${itemsPerPage}-${searchKey}-${filtersKey}-${fieldIdsKey}`
  }, [activeTab, currentPage, itemsPerPage, debouncedSearchQuery, filters, selectedFieldIds])

  const updateTabIndicator = useCallback(() => {
    if (!tabsRef.current || !indicatorRef.current) return

    const tabs = ["fields", "professors", "list"]
    const activeIndex = tabs.indexOf(activeTab)
    const tabButtons = tabsRef.current.querySelectorAll(".tab-button")

    if (tabButtons[activeIndex]) {
      const activeButton = tabButtons[activeIndex] as HTMLElement
      const tabsContainer = tabsRef.current

      const containerRect = tabsContainer.getBoundingClientRect()
      const buttonRect = activeButton.getBoundingClientRect()

      const leftPosition = buttonRect.left - containerRect.left
      const buttonWidth = buttonRect.width

      const indicatorWidth = isMobile ? Math.min(60, buttonWidth * 0.8) : Math.min(84, buttonWidth * 0.9)
      const indicatorLeft = leftPosition + (buttonWidth - indicatorWidth) / 2

      indicatorRef.current.style.width = `${indicatorWidth}px`
      indicatorRef.current.style.left = `${indicatorLeft}px`
      indicatorRef.current.style.transform = "none"
    }
  }, [activeTab, isMobile])

  // Update indicator when tab changes or component mounts
  useEffect(() => {
    const updateIndicator = () => {
      requestAnimationFrame(() => {
        updateTabIndicator()
      })
    }
    updateIndicator()
  }, [updateTabIndicator])

  // Update indicator on window resize
  useEffect(() => {
    const handleResize = () => {
      updateTabIndicator()
    }
    window.addEventListener("resize", handleResize)
    return () => window.removeEventListener("resize", handleResize)
  }, [updateTabIndicator])

  // Reset multi-select mode when changing tabs
  useEffect(() => {
    if (activeTab !== "fields") {
      setIsMultiSelectMode(false)
      setSelectedFields(new Set())
      setSelectionLimitReached(false)
    }
  }, [activeTab])

  // Stable URL update function
  const updateURL = useCallback(
    (params: {
      tab?: string
      page?: number
      search?: string
      filters?: string[]
      fieldIds?: string[]
      clearFilters?: boolean
      clearFieldIds?: boolean
    }) => {
      const newSearchParams = new URLSearchParams()

      if (params.tab !== undefined) newSearchParams.set("tab", params.tab)
      else if (activeTab) newSearchParams.set("tab", activeTab)

      if (params.page !== undefined) newSearchParams.set("page", params.page.toString())
      else if (currentPage > 1) newSearchParams.set("page", currentPage.toString())

      if (params.search !== undefined) {
        if (params.search) newSearchParams.set("search", params.search)
      } else if (searchQuery) {
        newSearchParams.set("search", searchQuery)
      }

      if (params.clearFilters) {
        // Don't add any filters
      } else if (params.filters !== undefined) {
        params.filters.forEach((filter) => {
          newSearchParams.append("filter", filter)
        })
      } else {
        filters.forEach((filter) => {
          newSearchParams.append("filter", filter)
        })
      }

      if (params.clearFieldIds) {
        // Don't add any field IDs
      } else if (params.fieldIds !== undefined) {
        params.fieldIds.forEach((fieldId) => {
          newSearchParams.append("fieldId", fieldId)
        })
      } else {
        selectedFieldIds.forEach((fieldId) => {
          newSearchParams.append("fieldId", fieldId)
        })
      }

      router.push(`?${newSearchParams.toString()}`, { scroll: false })
    },
    [router, activeTab, currentPage, searchQuery, filters, selectedFieldIds],
  )

  // Handle tab change
  const handleTabChange = useCallback(
    (tab: string) => {
      updateURL({ tab, page: 1 })
    },
    [updateURL],
  )

  // Handle search
  const handleSearch = useCallback(
    (query: string) => {
      updateURL({ search: query, page: 1 })
    },
    [updateURL],
  )

  // Handle page change
  const handlePageChange = useCallback(
    (page: number) => {
      updateURL({ page })
    },
    [updateURL],
  )

  const toggleExpand = useCallback((index: number) => {
    setExpandedTopic((prev) => (prev === index ? null : index))
  }, [])

  // Toggle multi-select mode
  const toggleMultiSelectMode = useCallback(() => {
    setIsMultiSelectMode((prev) => !prev)
    setSelectedFields(new Set())
    setSelectionLimitReached(false)
  }, [])

  // Handle field selection in multi-select mode
  const handleFieldSelection = useCallback(
    (field: Field) => {
      if (isMultiSelectMode) {
        setSelectedFields((prev) => {
          const newSelected = new Set(prev)

          if (newSelected.has(field.id)) {
            newSelected.delete(field.id)
            setSelectionLimitReached(false)
          } else {
            if (newSelected.size < MAX_FIELD_SELECTIONS) {
              newSelected.add(field.id)
              setSelectionLimitReached(newSelected.size >= MAX_FIELD_SELECTIONS)
            } else {
              setSelectionLimitReached(true)
              return prev // Don't update if limit reached
            }
          }

          return newSelected
        })
      } else {
        // Use tag name for filtering instead of field name
        updateURL({ tab: "list", page: 1, filters: [field.name] })
      }
    },
    [isMultiSelectMode, updateURL],
  )

  // Navigate to list tab with selected fields using the new server action
  const navigateToListWithSelectedFields = useCallback(async () => {
    if (selectedFields.size === 0) return

    const selectedFieldIds = Array.from(selectedFields)

    // Update URL with field IDs instead of field names
    updateURL({
      tab: "list",
      page: 1,
      fieldIds: selectedFieldIds,
      clearFilters: true, // Clear existing filters when using field selection
    })

    setIsMultiSelectMode(false)
    setSelectedFields(new Set())
  }, [selectedFields, updateURL])

  // Remove individual filter
  const removeFilter = useCallback(
    (filterToRemove: string) => {
      const newFilters = filters.filter((filter) => filter !== filterToRemove)
      updateURL({ filters: newFilters, page: 1 })
    },
    [filters, updateURL],
  )

  // Clear all filters
  const clearAllFilters = useCallback(() => {
    updateURL({ clearFilters: true, page: 1 })
  }, [updateURL])

  // Clear field-based filtering
  const clearFieldFilters = useCallback(() => {
    updateURL({ clearFieldIds: true, page: 1 })
  }, [updateURL])

  // Toggle showing all filters
  const toggleShowAllFilters = useCallback(() => {
    setShowAllFilters((prev) => !prev)
  }, [])

  // Main data fetching effect - simplified dependencies
  useEffect(() => {
    // Cancel any ongoing request
    if (abortControllerRef.current) {
      abortControllerRef.current.abort()
    }

    // Create new abort controller
    abortControllerRef.current = new AbortController()
    const signal = abortControllerRef.current.signal

    async function fetchData() {
      // Check cache first
      let cachedData = null
      if (activeTab === "fields") {
        cachedData = fieldsCache.getCachedData(cacheKey)
      } else if (activeTab === "professors") {
        cachedData = professorsCache.getCachedData(cacheKey)
      } else if (activeTab === "list") {
        if (isFilteredMode) {
          cachedData = filteredTopicsCache.getCachedData(cacheKey)
        } else {
          cachedData = topicsCache.getCachedData(cacheKey)
        }
      }

      if (cachedData && !signal.aborted) {
        // Use cached data
        if (activeTab === "fields") {
          setFields(cachedData.fields || [])
        } else if (activeTab === "professors") {
          setProfessors(cachedData.professors || [])
        } else if (activeTab === "list") {
          setTopics(cachedData.topics || [])
        }

        setPagination({
          totalPages: cachedData.totalPages || 0,
          totalCount: cachedData.totalCount || 0,
          currentPage: cachedData.currentPage || 1,
        })

        setIsLoading(false)
        return
      }

      // No cached data, fetch from server
      setIsLoading(true)

      try {
        if (signal.aborted) return

        if (activeTab === "fields") {
          const res = await getFieldsFromTags(currentPage, itemsPerPage, debouncedSearchQuery)
          if (res.success && !signal.aborted) {
            setFields(res.fields)
            setPagination({
              totalPages: res.totalPages,
              totalCount: res.totalCount,
              currentPage: res.currentPage,
            })
            fieldsCache.setCachedData(cacheKey, res)
          }
        } else if (activeTab === "professors") {
          const res = await getProfessors(currentPage, itemsPerPage, debouncedSearchQuery)
          if (res.success && !signal.aborted) {
            setProfessors(res.professors)
            setPagination({
              totalPages: res.totalPages,
              totalCount: res.totalCount,
              currentPage: res.currentPage,
            })
            professorsCache.setCachedData(cacheKey, res)
          }
        } else if (activeTab === "list") {
          // Use the new server action if we have selected field IDs
          if (isFilteredMode && selectedFieldIds.length > 0) {
            const res = await filterSelectedFields({
              selectedFieldIds,
              searchQuery: debouncedSearchQuery,
              page: currentPage,
              itemsPerPage,
            })

            if (res.success && !signal.aborted) {
              setTopics(res.topics)
              setPagination({
                totalPages: res.pagination.totalPages,
                totalCount: res.pagination.totalCount,
                currentPage: res.pagination.currentPage,
              })
              filteredTopicsCache.setCachedData(cacheKey, {
                ...res,
                totalPages: res.pagination.totalPages,
                totalCount: res.pagination.totalCount,
                currentPage: res.pagination.currentPage,
              })
            }
          } else {
            // Use the original getTopics function
            let combinedSearchQuery = debouncedSearchQuery
            if (filters.length > 0) {
              const filterQuery = filters.join(" ")
              combinedSearchQuery = debouncedSearchQuery ? `${debouncedSearchQuery} ${filterQuery}` : filterQuery
            }

            const studentId = undefined // Replace with actual student ID when available
            const res = await getTopics(combinedSearchQuery, currentPage, itemsPerPage, studentId)
            if (res.success && !signal.aborted) {
              setTopics(res.topics)
              setPagination({
                totalPages: res.totalPages,
                totalCount: res.totalCount,
                currentPage: res.currentPage,
              })
              topicsCache.setCachedData(cacheKey, res)
            }
          }
        }
      } catch (error) {
        if (!signal.aborted) {
          console.error("Error fetching data:", error)
        }
      } finally {
        if (!signal.aborted) {
          setIsLoading(false)
        }
      }
    }

    fetchData()

    return () => {
      if (abortControllerRef.current) {
        abortControllerRef.current.abort()
      }
    }
  }, [
    // Only include the essential dependencies that should trigger a refetch
    cacheKey, // This is stable and includes all the necessary parameters
    activeTab,
    currentPage,
    debouncedSearchQuery,
    filters.join(","), // Convert array to string to make it stable
    selectedFieldIds.join(","), // Include selected field IDs
    itemsPerPage,
    isFilteredMode,
  ])

  // Filter results based on search query
  const filteredResults = useFilterOnClient(tab, searchQuery, {
    fields,
    professors,
    topics,
  })

  return (
    <main className="min-h-screen bg-[#110833] text-white">
      <div className="app-container">
        {/* Header with search and user icon */}
        <div className="header">
          <div className="search-container">
            <Search className="search-icon" />
            <input
              type="search"
              placeholder="Search"
              value={searchQuery}
              className="search-input"
              onChange={(e) => handleSearch(e.target.value)}
            />
          </div>
          <Link href="/student" className="user-button">
            <User className="h-5 w-5" />
          </Link>
        </div>

        {/* Tabs navigation with animated indicator */}
        <div className="tabs-container">
          <div ref={tabsRef} className="tabs-nav">
            {["fields", "professors", "list"].map((tab) => (
              <button
                key={tab}
                onClick={() => handleTabChange(tab)}
                className={`tab-button ${activeTab === tab ? "active" : ""}`}
              >
                {tab}
              </button>
            ))}
            <div ref={indicatorRef} className="tab-indicator" />
          </div>
        </div>

        {/* Multi-select button for fields tab */}
        {activeTab === "fields" && (
          <div className="mb-6 flex justify-between items-center">
            {!isMultiSelectMode ? (
              <Button
                onClick={toggleMultiSelectMode}
                className="bg-yellow-400 hover:bg-yellow-500 text-black font-medium"
              >
                Choose Multiple Fields
              </Button>
            ) : (
              <div className="flex flex-col">
                <div className="flex items-center gap-2">
                  <Button
                    onClick={toggleMultiSelectMode}
                    variant="outline"
                    className="border-white/30 text-white hover:bg-white/10"
                  >
                    Cancel
                  </Button>
                  <span className="text-sm text-white/70">
                    {selectedFields.size} of {MAX_FIELD_SELECTIONS} selected
                  </span>
                </div>
                {selectionLimitReached && (
                  <p className="text-sm text-yellow-400 mt-1">
                    Maximum of {MAX_FIELD_SELECTIONS} fields can be selected
                  </p>
                )}
              </div>
            )}

            {/* Continue button - only show when fields are selected */}
            {isMultiSelectMode && selectedFields.size > 0 && (
              <Button
                onClick={navigateToListWithSelectedFields}
                className="bg-yellow-400 hover:bg-yellow-500 text-black font-medium"
              >
                Continue with {selectedFields.size} {selectedFields.size === 1 ? "field" : "fields"}
              </Button>
            )}
          </div>
        )}

        {/* Filter display for list tab */}
        {activeTab === "list" && (filters.length > 0 || isFilteredMode) && (
          <div className="mb-6">
            {/* Field-based filters */}
            {isFilteredMode && (
              <div className="mb-4">
                <div className="flex items-center gap-2 mb-2">
                  <span className="text-sm text-white/70">Filtered by fields:</span>
                  <Badge
                    variant="secondary"
                    className="bg-yellow-400/20 text-yellow-400 border-yellow-400/30 px-3 py-1 text-sm"
                  >
                    {selectedFieldIds.length} field{selectedFieldIds.length !== 1 ? "s" : ""} selected
                  </Badge>
                </div>
                <Button
                  onClick={clearFieldFilters}
                  variant="outline"
                  size="sm"
                  className="border-yellow-400/30 text-yellow-400 hover:bg-yellow-400/10"
                >
                  Clear Field Filters
                </Button>
              </div>
            )}

            {/* Regular text-based filters */}
            {filters.length > 0 && (
              <div>
                <div className="flex flex-wrap gap-2 items-center mb-3">
                  {/* Show visible filters */}
                  {filters.slice(0, showAllFilters ? filters.length : visibleFilterCount).map((filter, index) => (
                    <Badge
                      key={`${filter}-${index}`}
                      variant="secondary"
                      className="bg-white/10 text-white border-white/20 px-3 py-1 text-sm flex items-center gap-2"
                    >
                      {filter}
                      <button
                        onClick={() => removeFilter(filter)}
                        className="hover:bg-white/20 rounded-full p-0.5 transition-colors"
                        aria-label={`Remove ${filter} filter`}
                      >
                        <X className="w-3 h-3" />
                      </button>
                    </Badge>
                  ))}

                  {/* Show "X more" button if there are hidden filters */}
                  {hasHiddenFilters && !showAllFilters && (
                    <button
                      onClick={toggleShowAllFilters}
                      className="text-sm text-white/70 hover:text-white flex items-center gap-1 px-2 py-1 rounded-full hover:bg-white/10 transition-colors"
                    >
                      +{filters.length - visibleFilterCount} more
                      <ChevronDown className="w-3 h-3" />
                    </button>
                  )}

                  {/* Show "Show less" button when expanded */}
                  {showAllFilters && hasHiddenFilters && (
                    <button
                      onClick={toggleShowAllFilters}
                      className="text-sm text-white/70 hover:text-white flex items-center gap-1 px-2 py-1 rounded-full hover:bg-white/10 transition-colors"
                    >
                      Show less
                      <ChevronDown className="w-3 h-3 rotate-180" />
                    </button>
                  )}
                </div>

                {/* Clear all filters button */}
                <Button
                  onClick={clearAllFilters}
                  variant="outline"
                  size="sm"
                  className="border-white/30 text-white hover:bg-white/10"
                >
                  Clear All Filters
                </Button>
              </div>
            )}
          </div>
        )}

        {/* Content with loading states */}
        <div className="content-container">
          {/* Fields tab */}
          {activeTab === "fields" && (
            <>
              {isLoading ? (
                <FieldsSkeleton />
              ) : (
                <div className="fields-grid">
                  {fields.length > 0 ? (
                    fields.map((field) => (
                      <div
                        key={field.id}
                        onClick={() => handleFieldSelection(field)}
                        className={`field-card cursor-pointer relative ${
                          selectedFields.has(field.id) ? "selected" : ""
                        }`}
                      >
                        {isMultiSelectMode && (
                          <div className="absolute top-3 left-3 z-10">
                            <div
                              className={`w-5 h-5 rounded border-2 flex items-center justify-center ${
                                selectedFields.has(field.id)
                                  ? "bg-white border-white"
                                  : "border-white/50 bg-transparent"
                              }`}
                            >
                              {selectedFields.has(field.id) && <Check className="w-3 h-3 text-black" />}
                            </div>
                          </div>
                        )}
                        <span className="text-lg font-medium">{field.name}</span>
                      </div>
                    ))
                  ) : (
                    <p className="text-center text-white/70 py-8 col-span-full">No fields found</p>
                  )}
                </div>
              )}
            </>
          )}

          {/* Professors tab */}
          {activeTab === "professors" && (
            <>
              {isLoading ? (
                <ProfessorsSkeleton />
              ) : (
                <div className="professors-list">
                  {professors.length > 0 ? (
                    professors.map((professor) => (
                      <Link key={professor.id} href={`/professor/${professor.id}`} className="block">
                        <div className="professor-card">
                          <div>
                            <h3 className="font-bold text-lg card-title">{professor.name}</h3>
                            <p className="text-sm card-subtitle">{professor.department}</p>
                          </div>
                          <ChevronRight className="h-6 w-6 card-icon" />
                        </div>
                      </Link>
                    ))
                  ) : (
                    <p className="text-center text-white/70 py-8">No professors found</p>
                  )}
                </div>
              )}
            </>
          )}

          {/* Topics/List tab */}
          {activeTab === "list" && (
            <>
              {isLoading ? (
                <TopicsSkeleton />
              ) : (
                <div className="topics-list">
                  {topics.length > 0 ? (
                    topics.map((topic, index) => (
                      <div key={topic.id} className="list-card">
                        <div className="flex justify-between items-start">
                          <div className="flex-1">
                            <div className="flex items-center gap-2">
                              <h3 className="font-medium card-title">{topic.title}</h3>
                              <button onClick={() => toggleExpand(index)} className="p-1 rounded-full">
                                {expandedTopic === index ? (
                                  <ChevronRight className="h-4 w-4 card-icon rotate-90" />
                                ) : (
                                  <ChevronRight className="h-4 w-4 card-icon" />
                                )}
                              </button>
                            </div>
                            <p className="text-xs card-subtitle">{topic.field}</p>
                            <p className="text-xs mt-1 card-subtitle line-clamp-2">{topic.description}</p>

                            {expandedTopic === index && topic.professor && (
                              <div className="mt-4 space-y-2">
                                <h4 className="text-sm font-medium card-title">Professor</h4>
                                <div className="flex flex-col gap-1 text-sm">
                                  <p className="card-title">{topic.professor.name}</p>
                                  <p className="card-subtitle">{topic.professor.department}</p>
                                </div>
                              </div>
                            )}

                            {expandedTopic === index && topic.tags?.length > 0 && (
                              <div className="mt-4">
                                <div className="flex flex-wrap gap-2">
                                  {topic.tags.map((tag, tagIndex) => (
                                    <span
                                      key={tagIndex}
                                      className="text-xs px-2 py-1 rounded-full bg-white/10 card-subtitle"
                                    >
                                      {tag}
                                    </span>
                                  ))}
                                </div>
                              </div>
                            )}
                          </div>

                          {expandedTopic !== index && (
                            <Link href={`/topic/${topic.id}`} className="ml-4">
                              <ChevronRight className="h-5 w-5 card-icon" />
                            </Link>
                          )}
                        </div>
                      </div>
                    ))
                  ) : (
                    <div className="text-center py-12">
                      <p className="text-white/70 text-lg mb-4">
                        {filters.length > 0 || searchQuery || isFilteredMode
                          ? "No topics found for the current search and filters"
                          : "No topics available"}
                      </p>
                      {(filters.length > 0 || searchQuery || isFilteredMode) && (
                        <div className="space-y-2">
                          <button
                            onClick={() =>
                              updateURL({
                                search: "",
                                clearFilters: true,
                                clearFieldIds: true,
                                page: 1,
                              })
                            }
                            className="text-yellow-400 hover:text-yellow-300 underline block"
                          >
                            Clear search and filters
                          </button>
                          <button
                            onClick={() => handleTabChange("fields")}
                            className="text-yellow-400 hover:text-yellow-300 underline block"
                          >
                            Browse fields
                          </button>
                        </div>
                      )}
                    </div>
                  )}
                </div>
              )}
            </>
          )}
        </div>

        {/* Pagination */}
        {!isLoading && pagination.totalPages > 1 && (
          <Pagination
            currentPage={pagination.currentPage}
            totalPages={pagination.totalPages}
            onPageChange={handlePageChange}
            isLoading={isLoading}
          />
        )}
      </div>
    </main>
  )
}
