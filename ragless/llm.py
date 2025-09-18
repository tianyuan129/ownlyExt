from fastmcp import FastMCP
import sys

from ollama import chat
from ollama import ChatResponse

mcp = FastMCP("NDN RAG")

@mcp.tool
def ndn_qa(message: str) -> str:
    messages = [
        {"role" : "system", "content" : """You are an AI agent that provides reasoning for tasks regarding Named-Data Networking (NDN).
         - Do not mix TCP/IP reasoning or logic with reasoning about NDN. Only use information you know about NDN. The other agent can answer questions about NDN.
         - If you are unsure about an answer or you do not know the answer to a question, say so in your response.
         - If answering, provide a detailed response, ensuring you completely answer the user's question.
         """}
    ]
    messages.append(                                                                                
        {"role" : "user", "content" : message}                                                            
    )                                                                                               
                                                                                                    
    response: ChatResponse = chat(model='gpt-oss:20b', messages=messages)

    return response.message.content

mcp.run()
