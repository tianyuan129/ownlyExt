from fastmcp import FastMCP
import sys

from transformers import AutoTokenizer

from peft import PeftModel
from transformers import AutoModelForCausalLM

base_model = AutoModelForCausalLM.from_pretrained("unsloth/qwen3-4b-unsloth-bnb-4bit")
model = PeftModel.from_pretrained(base_model, "cg48/ndn-finetune")

tokenizer = AutoTokenizer.from_pretrained("unsloth/qwen3-4b-unsloth-bnb-4bit")

mcp = FastMCP("NDN RAG")

@mcp.tool
def ndn_qa(message: str) -> str:
    messages = [
        {"role" : "system", "content" : """You are an AI agent that answers questions about Named-Data Networking (NDN).
         - Do not mix TCP/IP reasoning or logic with reasoning about NDN. Only use information you know about NDN.
         - If you are unsure about an answer or you do not know the answer to a question, say so in your response.
         - Provide a detailed response, ensuring you completely answer the user's question.
         - Reason step by step.
         """}
    ]
    messages.append(                                                                                
        {"role" : "user", "content" : message}                                                            
    )                                                                                               
                                                                                                    
    text = tokenizer.apply_chat_template(                                                           
        messages,                                                                                   
        tokenize = False,                                                                           
        add_generation_prompt = True, # Must add for generation                                     
        enable_thinking = True, # Disable thinking                                                  
    )                                                                                               
                                                                                                    
    model_inputs = tokenizer([text], return_tensors="pt").to(model.device)     

    generated_ids = model.generate(**model_inputs, max_length=1000)
    output = tokenizer.batch_decode(generated_ids)[0]
    return output[output.rindex("</think>") + 10:-10]

mcp.run()

