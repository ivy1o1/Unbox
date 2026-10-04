from fastapi import FastAPI

app = FastAPI(title="Unbox API")


@app.get("/")
def root():
    return {"message": "Unbox API is running"}
