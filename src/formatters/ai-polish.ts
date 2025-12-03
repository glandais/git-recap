import { execSync } from "child_process";

/**
 * Check if Claude CLI is available
 */
export function isClaudeAvailable(): boolean {
  try {
    execSync("which claude", { encoding: "utf-8", stdio: "pipe" });
    return true;
  } catch {
    return false;
  }
}

/**
 * Invoke Claude CLI with a prompt
 */
function invokeClaudeCLI(prompt: string): string {
  try {
    const result = execSync(`claude -p "${prompt.replace(/"/g, '\\"')}" --model haiku`, {
      encoding: "utf-8",
      maxBuffer: 10 * 1024 * 1024,
      timeout: 120000,
    });
    return result.trim();
  } catch (error) {
    console.error("Claude CLI error:", error);
    throw error;
  }
}

/**
 * Polish LinkedIn output for maximum engagement
 */
export function polishLinkedIn(content: string): string {
  const prompt = `You are a LinkedIn content expert. Polish this developer year-in-review post for maximum engagement.

RULES:
- Keep it under 3000 characters (LinkedIn limit)
- Use a confident but humble tone
- Add strategic line breaks for readability
- Keep the stats and achievements but make them more compelling
- End with a question to drive comments
- Keep hashtags but limit to 5 relevant ones
- DO NOT add emojis unless already present
- Return ONLY the polished post, no explanations

ORIGINAL POST:
${content}

POLISHED POST:`;

  try {
    const polished = invokeClaudeCLI(prompt);
    // Ensure we got a valid response
    if (polished.length > 100) {
      return polished;
    }
    return content;
  } catch {
    console.error("Failed to polish with AI, using original content");
    return content;
  }
}

/**
 * Polish Markdown output for blog readability
 */
export function polishMarkdown(content: string): string {
  const prompt = `You are a technical blog editor. Polish this developer year-in-review markdown post.

RULES:
- Improve readability and flow
- Make achievements sound more impactful without being boastful
- Add a compelling introduction paragraph after the title
- Ensure consistent formatting
- Keep all links, stats, and technical details accurate
- Add a brief conclusion/reflection section before the footer
- Return ONLY the polished markdown, no explanations
- Preserve all markdown formatting

ORIGINAL POST:
${content}

POLISHED POST:`;

  try {
    const polished = invokeClaudeCLI(prompt);
    // Ensure we got valid markdown back
    if (polished.includes("#") && polished.length > 200) {
      return polished;
    }
    return content;
  } catch {
    console.error("Failed to polish with AI, using original content");
    return content;
  }
}

/**
 * Polish content based on format
 */
export function polishContent(content: string, format: "markdown" | "linkedin"): string {
  if (!isClaudeAvailable()) {
    console.error("Claude CLI not available. Install with: npm install -g @anthropic-ai/claude-code");
    return content;
  }

  console.error("Polishing with AI...");

  switch (format) {
    case "linkedin":
      return polishLinkedIn(content);
    case "markdown":
      return polishMarkdown(content);
    default:
      return content;
  }
}
