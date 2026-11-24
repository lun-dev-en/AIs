from typing import Annotated

from pydantic import BaseModel, ConfigDict, Field, StringConstraints

Text = Annotated[str, StringConstraints(strip_whitespace=True, min_length=1, max_length=10000)]


class Input(BaseModel):
    model_config = ConfigDict(extra='forbid', str_strip_whitespace=True)


class ProfileInput(Input):
    personality_name: Annotated[str, StringConstraints(min_length=1, max_length=80)]
    personality1: Annotated[str, StringConstraints(min_length=1, max_length=500)]
    personality2: Annotated[str, StringConstraints(max_length=500)] | None = None


class MemoryInput(Input):
    past_memory: Text
    think: Text


class FormedInput(Input):
    formed_personality: Text


class Conditions(Input):
    basic: bool = True
    memories: bool = True
    thoughts: bool = True
    formed: bool = True


class CompareInput(Input):
    question: Annotated[str, StringConstraints(min_length=1, max_length=2000)]
    conditions: Conditions = Field(default_factory=Conditions)
    temperature: float = Field(default=0.7, ge=0, le=2, allow_inf_nan=False)
    seed: int = Field(default=42, ge=0, le=2147483647)
    parent_question_id: int | None = Field(default=None, gt=0)
