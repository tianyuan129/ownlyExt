from fastmcp import FastMCP
import sys

from ollama import ChatResponse, chat

from langchain_core.documents import Document
from langchain_community.document_loaders import PyPDFLoader

mcp = FastMCP("Paper RAG")

def fetch_paper(index: int) -> str:
  """
  Fetch an entire paper

  0. HTTP as the narrow waist of the future internet

  Args:
    index (int): The index of the paper from the list to search

  Returns:
    str: The retrieved paper
  """

  file_path = "/srv/llama/docs/random/httpwaist.pdf"

  loader = PyPDFLoader(file_path)

  text = ""
  for page in loader.lazy_load():
    text = text + page.page_content

  document = Document(
    page_content=text
  )

  return text


@mcp.tool
def ndn_qa(message: str) -> str:
    user_message = {'role': 'user', 'content': message}

    messages = [
    {'role': 'system', 'content': '''You are an AI assistant that answers questions about networking.
        - Use tools to respond when necessary
        - Make sure to fully answer the user's question
        - Answers should have enough detail and context but still be concise'''},
        user_message
    ]

    available_functions = {
        'fetch_paper': fetch_paper,
    }

    response: ChatResponse = chat(
        'gpt-oss:20b',
        messages=messages,
        tools=[fetch_paper],
    )

    if response.message.tool_calls:
        # There may be multiple tool calls in the response
        for tool in response.message.tool_calls:
            # Ensure the function is available, and then call it
            if function_to_call := available_functions.get(tool.function.name):
                output = function_to_call(**tool.function.arguments)
    else:
       return response.message

    # Only needed to chat with the model using the tool call results
    if response.message.tool_calls:
        # Add the function response to messages for the model to use
        messages.append(response.message)
        messages.append({'role': 'tool', 'content': str(output), 'tool_name': tool.function.name})
        messages.append(user_message)

        # Get final response from model with function outputs
        final_response = chat('gpt-oss:20b', messages=messages)

    return str(final_response.message.content)

mcp.run()
