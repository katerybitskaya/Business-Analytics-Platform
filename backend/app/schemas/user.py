import uuid
from datetime import datetime
from enum import Enum

from pydantic import BaseModel, ConfigDict, EmailStr, Field, field_validator


class CompanySize(str, Enum):
    small = "small"
    medium = "medium"
    large = "large"


class ThemePreference(str, Enum):
    light = "light"
    dark = "dark"
    system = "system"


class UserRegister(BaseModel):
    email: EmailStr
    username: str = Field(min_length=3, max_length=50)
    password: str = Field(min_length=8, max_length=128)
    first_name: str = Field(min_length=1)
    last_name: str = Field(min_length=1)

    @field_validator("username")
    @classmethod
    def username_no_spaces(cls, v: str) -> str:
        if " " in v:
            raise ValueError("Имя пользователя не должно содержать пробелы")
        return v


class UserLogin(BaseModel):
    login: str
    password: str


class TokenPair(BaseModel):
    access_token: str
    refresh_token: str
    token_type: str = "bearer"


class RefreshRequest(BaseModel):
    refresh_token: str


class PasswordResetRequest(BaseModel):
    email: EmailStr


class PasswordResetConfirm(BaseModel):
    token: str
    new_password: str = Field(min_length=8, max_length=128)


class PasswordChange(BaseModel):
    old_password: str
    new_password: str = Field(min_length=8, max_length=128)


class EmailChangeRequest(BaseModel):
    email: EmailStr


class UserProfileUpdate(BaseModel):
    company_name: str | None = None
    industry: str | None = None
    company_size: CompanySize | None = None
    position: str | None = None


class UserProfileOut(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    company_name: str | None
    industry: str | None
    company_size: str | None
    position: str | None
    profile_complete: bool


class UserUpdate(BaseModel):
    first_name: str | None = None
    last_name: str | None = None
    language: str | None = None
    theme: ThemePreference | None = None
    photo: str | None = None


class UserOut(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: uuid.UUID
    email: EmailStr
    username: str
    first_name: str
    last_name: str
    photo: str | None
    language: str
    theme: str
    created_at: datetime
    profile: UserProfileOut | None = None
