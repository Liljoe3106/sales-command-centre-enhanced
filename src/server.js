import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import { pipelineTools } from './tools/pipeline.js';
import { activityTools } from './tools/activity.js';
import { emailTools } from './tools/email.js';
import { reportTools } from './tools/reports.js';

const server = new McpServer({
  name: 'sales-manager',
  version: '1.0.0'
});

const allTools = [...pipelineTools, ...activityTools, ...emailTools, ...reportTools];

for (const tool of allTools) {
  server.tool(
    tool.name,
    tool.description,
    tool.schema,
    async (args) => {
      try {
        const result = await Promise.resolve(tool.handler(args));
        return { content: [{ type: 'text', text: String(result) }] };
      } catch (err) {
        return {
          content: [{ type: 'text', text: `Error: ${err.message}` }],
          isError: true
        };
      }
    }
  );
}

const transport = new StdioServerTransport();
await server.connect(transport);
