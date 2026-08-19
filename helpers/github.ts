import { Octokit } from "@octokit/rest";

export const saveDataToGitHub = async (
    path: string,
    data: string,
    timestamp: number
  ) => {
    const octokit = new Octokit({
      auth: process.env.GITHUB_TOKEN,
    });
  
    const owner = "VotaFi";
    const repo = "delegators-stats";
    const content = Buffer.from(data).toString("base64");
  
    try {
      // Get the SHA of the current file
      const result = await octokit.request(
        `GET /repos/${owner}/${repo}/contents/${path}`,
        {
          owner,
          repo,
          file_path: path,
          branch: "main",
        }
      );
  
      await octokit.repos.createOrUpdateFileContents({
        owner,
        repo,
        path,
        message: `Add data for timestamp ${timestamp}`,
        content,
        sha: result.data.sha,
      });
      console.log(`Data saved to GitHub at ${path}`);
    } catch (error) {
      console.error(`Failed to save data to GitHub: ${error}`);
    }
  };
