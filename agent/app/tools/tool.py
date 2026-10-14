from langchain.tools import BaseTool

'''
BaseTool -> Tool -> Other Tools
'''
class Tool:
    def __init__(self, name: str, description: str):
        self.name = name
        self.description = description

    def run(self, *args, **kwargs):
        raise NotImplementedError("Subclasses must implement the run method.")

