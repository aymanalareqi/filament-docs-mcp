import axios from 'axios';
import fs from 'fs/promises';
import path from 'path';
import { fileURLToPath } from 'url';

// Get the directory name
const __dirname = path.dirname(fileURLToPath(import.meta.url));
const CACHE_DIR = path.join(__dirname, '..', 'cache');
const GITHUB_API_BASE = 'https://api.github.com';
const GITHUB_RAW_CONTENT_BASE = 'https://raw.githubusercontent.com';
const FILAMENT_REPO = 'filamentphp/filament';
const DEFAULT_VERSION = '3.x';
const DEFAULT_BRANCH = '3.x';

// Define types for our documentation data
interface DocPage {
  title: string;
  url: string;
  content: string;
  version: string;
  section: string;
  subsection?: string;
  path?: string;
  rawContent?: string;
}

interface DocSection {
  title: string;
  pages: DocPage[];
  subsections?: {
    [key: string]: DocPage[];
  };
}

interface DocIndex {
  version: string;
  lastUpdated: string;
  sections: {
    [key: string]: DocSection;
  };
}

// GitHub API response types
interface GitHubContent {
  name: string;
  path: string;
  sha: string;
  size: number;
  url: string;
  html_url: string;
  git_url: string;
  download_url: string;
  type: string;
  content?: string;
  encoding?: string;
}

interface GitHubDirectory {
  [key: string]: {
    files: GitHubContent[];
    directories: string[];
  }
}

// Initialize cache directory
async function initCache() {
  try {
    await fs.mkdir(CACHE_DIR, { recursive: true });
  } catch (error) {
    console.error('Error creating cache directory:', error);
  }
}

// Load or create the documentation index
async function getDocIndex(version = DEFAULT_VERSION): Promise<DocIndex> {
  await initCache();
  const indexPath = path.join(CACHE_DIR, `index_${version}.json`);

  try {
    const data = await fs.readFile(indexPath, 'utf-8');
    return JSON.parse(data) as DocIndex;
  } catch (error) {
    // If the file doesn't exist or can't be read, create a new index
    const newIndex: DocIndex = {
      version,
      lastUpdated: new Date().toISOString(),
      sections: {}
    };

    // Save the new index
    await fs.writeFile(indexPath, JSON.stringify(newIndex, null, 2));
    return newIndex;
  }
}

// Save the documentation index
async function saveDocIndex(index: DocIndex) {
  const indexPath = path.join(CACHE_DIR, `index_${index.version}.json`);
  await fs.writeFile(indexPath, JSON.stringify(index, null, 2));
}

// Fetch content from GitHub repository
async function fetchGitHubContent(path: string, branch = DEFAULT_BRANCH): Promise<string> {
  try {
    const url = `${GITHUB_RAW_CONTENT_BASE}/${FILAMENT_REPO}/${branch}/${path}`;
    const response = await axios.get(url);
    return response.data;
  } catch (error) {
    console.error(`Error fetching GitHub content from ${path}:`, error);
    throw error;
  }
}

// List contents of a directory in the GitHub repository
async function listGitHubDirectory(path: string, branch = DEFAULT_BRANCH): Promise<GitHubContent[]> {
  try {
    const url = `${GITHUB_API_BASE}/repos/${FILAMENT_REPO}/contents/${path}?ref=${branch}`;
    const response = await axios.get(url, {
      headers: {
        'Accept': 'application/vnd.github.v3+json'
      }
    });
    return response.data;
  } catch (error) {
    console.error(`Error listing GitHub directory ${path}:`, error);
    return [];
  }
}

// Extract title from markdown content
function extractTitleFromMarkdown(content: string): string {
  // Look for the first heading (# Title)
  const titleMatch = content.match(/^#\s+(.+)$/m);
  if (titleMatch && titleMatch[1]) {
    return titleMatch[1].trim();
  }

  // If no heading found, use the first line or a default title
  const firstLine = content.split('\n')[0].trim();
  return firstLine || 'Untitled Document';
}

// Parse markdown content to extract text
function parseMarkdownContent(content: string): string {
  // Remove code blocks
  let parsedContent = content.replace(/```[\s\S]*?```/g, '');

  // Remove HTML comments
  parsedContent = parsedContent.replace(/<!--[\s\S]*?-->/g, '');

  // Remove image tags
  parsedContent = parsedContent.replace(/!\[.*?\]\(.*?\)/g, '');

  // Remove links but keep the text
  parsedContent = parsedContent.replace(/\[([^\]]+)\]\([^)]+\)/g, '$1');

  // Remove HTML tags
  parsedContent = parsedContent.replace(/<[^>]*>/g, '');

  return parsedContent.trim();
}

// Process a markdown file into a DocPage
async function processMarkdownFile(filePath: string, version: string, section: string, subsection?: string): Promise<DocPage | null> {
  try {
    const rawContent = await fetchGitHubContent(filePath);
    const title = extractTitleFromMarkdown(rawContent);
    const content = parseMarkdownContent(rawContent);

    if (!content || !title) {
      return null;
    }

    const githubUrl = `https://github.com/${FILAMENT_REPO}/blob/${version}/${filePath}`;

    return {
      title,
      url: githubUrl,
      content,
      rawContent,
      version,
      section,
      subsection,
      path: filePath
    };
  } catch (error) {
    console.error(`Error processing markdown file ${filePath}:`, error);
    return null;
  }
}

// Fetch documentation structure from GitHub repository
async function fetchDocStructure(version = DEFAULT_VERSION): Promise<DocIndex> {
  const index = await getDocIndex(version);
  index.lastUpdated = new Date().toISOString();

  try {
    // Map of package names to section titles
    const packageSections: { [key: string]: string } = {
      'actions': 'Actions',
      'forms': 'Forms',
      'infolists': 'Infolists',
      'notifications': 'Notifications',
      'panels': 'Panels',
      'support': 'Support',
      'tables': 'Tables',
      'widgets': 'Widgets'
    };

    // Process each package's documentation
    for (const [packageName, sectionTitle] of Object.entries(packageSections)) {
      // Initialize section
      if (!index.sections[sectionTitle]) {
        index.sections[sectionTitle] = {
          title: sectionTitle,
          pages: [],
          subsections: {}
        };
      }

      // Get documentation files for this package
      const docsPath = `packages/${packageName}/docs`;
      const files = await listGitHubDirectory(docsPath, version);

      // Sort files by name (which often includes numeric prefixes for order)
      files.sort((a, b) => a.name.localeCompare(b.name));

      for (const file of files) {
        if (file.type === 'file' && file.name.endsWith('.md')) {
          // Check if this is a subsection file (in a subdirectory)
          const pathParts = file.path.split('/');
          const isSubsection = pathParts.length > 4; // packages/name/docs/subdir/file.md

          if (isSubsection) {
            const subsectionName = pathParts[3]; // The subdirectory name
            const formattedSubsectionName = subsectionName
              .split('-')
              .map(word => word.charAt(0).toUpperCase() + word.slice(1))
              .join(' ');

            // Initialize subsection if needed
            if (!index.sections[sectionTitle].subsections![formattedSubsectionName]) {
              index.sections[sectionTitle].subsections![formattedSubsectionName] = [];
            }

            // Process the markdown file
            const page = await processMarkdownFile(file.path, version, sectionTitle, formattedSubsectionName);
            if (page) {
              index.sections[sectionTitle].subsections![formattedSubsectionName].push(page);
            }
          } else {
            // This is a direct page in the section
            const page = await processMarkdownFile(file.path, version, sectionTitle);
            if (page) {
              index.sections[sectionTitle].pages.push(page);
            }
          }
        }
      }
    }

    // Save the updated index
    await saveDocIndex(index);
    return index;
  } catch (error) {
    console.error('Error fetching documentation structure:', error);
    return index;
  }
}

// Format the documentation structure as a string
function formatDocStructure(index: DocIndex): string {
  let result = `# Filament Documentation (v${index.version})\n\n`;
  result += `Last updated: ${new Date(index.lastUpdated).toLocaleString()}\n\n`;

  for (const sectionKey in index.sections) {
    const section = index.sections[sectionKey];
    result += `## ${section.title}\n\n`;

    // List direct pages
    for (const page of section.pages) {
      result += `- [${page.title}](${page.url})\n`;
    }

    // List subsections
    if (section.subsections) {
      for (const subsectionKey in section.subsections) {
        result += `\n### ${subsectionKey}\n\n`;

        for (const page of section.subsections[subsectionKey]) {
          result += `- [${page.title}](${page.url})\n`;
        }
      }
    }

    result += '\n';
  }

  return result;
}

// Search the documentation
function searchInDocIndex(index: DocIndex, query: string): string {
  const results: Array<{ title: string; url: string; snippet: string; score: number }> = [];
  const queryTerms = query.toLowerCase().split(/\s+/);

  // Search in all pages
  for (const sectionKey in index.sections) {
    const section = index.sections[sectionKey];

    // Search in direct pages
    for (const page of section.pages) {
      const score = getSearchScore(page, queryTerms);

      if (score > 0) {
        const snippet = getContentSnippet(page.content, queryTerms);
        results.push({
          title: page.title,
          url: page.url,
          snippet,
          score
        });
      }
    }

    // Search in subsection pages
    if (section.subsections) {
      for (const subsectionKey in section.subsections) {
        for (const page of section.subsections[subsectionKey]) {
          const score = getSearchScore(page, queryTerms);

          if (score > 0) {
            const snippet = getContentSnippet(page.content, queryTerms);
            results.push({
              title: page.title,
              url: page.url,
              snippet,
              score
            });
          }
        }
      }
    }
  }

  // Sort results by score (descending)
  results.sort((a, b) => b.score - a.score);

  // Format results
  if (results.length === 0) {
    return `No results found for query: "${query}"`;
  }

  let formattedResults = `# Search Results for "${query}"\n\n`;
  formattedResults += `Found ${results.length} result(s)\n\n`;

  for (const result of results) {
    formattedResults += `## [${result.title}](${result.url})\n\n`;
    formattedResults += `${result.snippet}\n\n`;
  }

  return formattedResults;
}

// Calculate search score for a page
function getSearchScore(page: DocPage, queryTerms: string[]): number {
  let score = 0;
  const content = page.content.toLowerCase();
  const title = page.title.toLowerCase();

  for (const term of queryTerms) {
    // Title matches are weighted more heavily
    if (title.includes(term)) {
      score += 10;
    }

    // Content matches
    if (content.includes(term)) {
      // Count occurrences
      const occurrences = (content.match(new RegExp(term, 'g')) || []).length;
      score += occurrences;
    }
  }

  return score;
}

// Get a snippet of content around the search terms
function getContentSnippet(content: string, queryTerms: string[]): string {
  const lowerContent = content.toLowerCase();

  // Find the first occurrence of any query term
  let firstIndex = -1;
  for (const term of queryTerms) {
    const index = lowerContent.indexOf(term);
    if (index !== -1 && (firstIndex === -1 || index < firstIndex)) {
      firstIndex = index;
    }
  }

  if (firstIndex === -1) {
    // No direct match found, return the beginning of the content
    return content.substring(0, 200) + '...';
  }

  // Get a snippet around the first occurrence
  const start = Math.max(0, firstIndex - 100);
  const end = Math.min(content.length, firstIndex + 200);
  let snippet = content.substring(start, end);

  // Add ellipsis if needed
  if (start > 0) {
    snippet = '...' + snippet;
  }
  if (end < content.length) {
    snippet = snippet + '...';
  }

  return snippet;
}

// Public API functions
export async function scrapeDocumentation(version = DEFAULT_VERSION): Promise<string> {
  const index = await fetchDocStructure(version);
  return formatDocStructure(index);
}

export async function searchDocumentation(query: string, version = DEFAULT_VERSION): Promise<string> {
  let index = await getDocIndex(version);

  // If the index is empty, fetch the documentation first
  if (Object.keys(index.sections).length === 0) {
    index = await fetchDocStructure(version);
  }

  return searchInDocIndex(index, query);
}

export async function getDocumentationInfo(version = DEFAULT_VERSION): Promise<string> {
  const index = await getDocIndex(version);

  let info = `# Filament Documentation Information\n\n`;
  info += `Version: ${index.version}\n`;
  info += `Last Updated: ${new Date(index.lastUpdated).toLocaleString()}\n\n`;
  info += `Source: GitHub Repository (${FILAMENT_REPO})\n\n`;

  // Count sections, pages, etc.
  const sectionCount = Object.keys(index.sections).length;
  let totalPages = 0;
  let subsectionCount = 0;

  for (const sectionKey in index.sections) {
    const section = index.sections[sectionKey];
    totalPages += section.pages.length;

    if (section.subsections) {
      subsectionCount += Object.keys(section.subsections).length;

      for (const subsectionKey in section.subsections) {
        totalPages += section.subsections[subsectionKey].length;
      }
    }
  }

  info += `Total Sections: ${sectionCount}\n`;
  info += `Total Subsections: ${subsectionCount}\n`;
  info += `Total Pages: ${totalPages}\n`;

  return info;
}

export async function updateDocumentation(version?: string, force = false): Promise<string> {
  const targetVersion = version || DEFAULT_VERSION;

  if (force) {
    // Force update by fetching the documentation from GitHub
    await fetchDocStructure(targetVersion);
    return `Documentation for version ${targetVersion} has been forcefully updated from GitHub.`;
  }

  // Check if we need to update
  const index = await getDocIndex(targetVersion);
  const lastUpdated = new Date(index.lastUpdated);
  const now = new Date();
  const daysSinceUpdate = (now.getTime() - lastUpdated.getTime()) / (1000 * 60 * 60 * 24);

  if (daysSinceUpdate > 7 || Object.keys(index.sections).length === 0) {
    // Update if it's been more than a week or if the index is empty
    await fetchDocStructure(targetVersion);
    return `Documentation for version ${targetVersion} has been updated from GitHub.`;
  }

  return `Documentation for version ${targetVersion} is already up to date (last updated ${lastUpdated.toLocaleString()}).`;
}
