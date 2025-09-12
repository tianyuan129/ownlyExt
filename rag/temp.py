from fastmcp import FastMCP
import sys

mcp = FastMCP("NDN RAG")

@mcp.tool
def ndn_qa(message: str) -> str:
    print("received", message, file=sys.stderr, flush=True)
    return 'test message'

mcp.run()