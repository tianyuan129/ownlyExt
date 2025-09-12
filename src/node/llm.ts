import { Client } from "@modelcontextprotocol/sdk/client";
import { StdioClientTransport } from "@modelcontextprotocol/sdk/client/stdio.js";

export class MCPClient {
  private client: Client;
  private transport: StdioClientTransport;

  constructor() {
    this.client = new Client({ name: "NDN Agent Client", version: "1.0.0" });
  }

  public async connectToServer(serverScriptPath: string) {
    const command = "python"

    const transport = new StdioClientTransport({
      command,
      args: [serverScriptPath]
    });

    await this.client.connect(transport);

    console.log("Connected to MCP backend");
    const tools = await this.client.listTools();
console.dir(tools, { depth: 10 });
  }

  public async call(query : string) {
    const result = await this.client.callTool({
      name: "ndn_qa",
      arguments: {["message"]: query}
    });
    console.dir(result, { depth: 10 });
    return result.structuredContent.result
  }
}
