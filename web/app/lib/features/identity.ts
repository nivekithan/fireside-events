export function getPublicId() {
  const publicId = window.sessionStorage.getItem("public-id");

  if (publicId) {
    return publicId;
  }

  const newPublicId = crypto.randomUUID();

  window.sessionStorage.setItem("public-id", newPublicId);

  return newPublicId;
}
