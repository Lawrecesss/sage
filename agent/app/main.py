from contextlib import asynccontextmanager

from dotenv import load_dotenv

load_dotenv()  # must run before Langfuse reads its env vars

from fastapi import FastAPI
from langchain.agents import create_agent
from langchain.tools import tool
from langfuse import get_client
from langfuse.langchain import CallbackHandler

from app.routers import items


@tool
def search(query: str) -> str:
    """Search for information."""
    return f"Results for: {query}"


agent = create_agent(model="openrouter:z-ai/glm-5.2", tools=[search])


@asynccontextmanager
async def lifespan(app: FastAPI):
    yield
    get_client().flush()  # send buffered spans before shutdown


app = FastAPI(lifespan=lifespan)
app.include_router(items.router)


@app.get("/ai")
def read_root(user_input: str):
    result = agent.invoke(
        {"messages": [{"role": "user", "content": user_input}]},
        config={
            "callbacks": [CallbackHandler()],
            "metadata": {"langfuse_session_id": "...", "langfuse_user_id": "..."},  # optional
        },
    )
    return result["messages"][-1].content