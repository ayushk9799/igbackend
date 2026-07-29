export const applyLegacyPuzzleMove = (storedPieces, fromIndex, toIndex) => {
    const pieces = Array.isArray(storedPieces)
        ? storedPieces.map(piece => (
            Number.isInteger(piece) && piece < 0 ? -piece - 1 : piece
        ))
        : [];

    if (
        Number.isInteger(fromIndex)
        && Number.isInteger(toIndex)
        && fromIndex >= 0
        && toIndex >= 0
        && fromIndex < pieces.length
        && toIndex < pieces.length
    ) {
        [pieces[fromIndex], pieces[toIndex]] = [pieces[toIndex], pieces[fromIndex]];
    }

    return pieces;
};
