import { Controller, Get } from "@nestjs/common";

const CATEGORIES = [
  {
    id: "dsa",
    name: "DSA",
    description: "Data Structures & Algorithms",
    topics: [
      "Arrays",
      "Trees",
      "Graphs",
      "DP",
      "Strings",
      "Sorting",
      "Linked Lists",
      "Heaps",
    ],
  },
  {
    id: "system-design",
    name: "System Design",
    description: "Architect scalable systems",
    topics: [
      "URL Shortener",
      "Twitter Feed",
      "Rate Limiter",
      "Chat System",
      "CDN",
      "Database Sharding",
    ],
  },
  {
    id: "behavioral",
    name: "Behavioral",
    description: "STAR method interviews",
    topics: [
      "Leadership",
      "Conflict Resolution",
      "Failure Stories",
      "Teamwork",
      "Goals",
    ],
  },
  {
    id: "fitness",
    name: "Fitness",
    description: "Workout accountability",
    topics: [],
  },
  {
    id: "speaking",
    name: "Speaking",
    description: "Public speaking practice",
    topics: [],
  },
  {
    id: "other",
    name: "Other",
    description: "Any other skill or goal",
    topics: [],
  },
];

@Controller("api/categories")
export class CategoriesController {
  @Get()
  getCategories() {
    return { categories: CATEGORIES };
  }
}
