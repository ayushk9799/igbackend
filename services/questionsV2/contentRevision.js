export const getSetContentRevision = (set = {}) => {
    const explicitRevision = Number(set.revision);
    if (Number.isFinite(explicitRevision) && explicitRevision > 0) {
        return Math.trunc(explicitRevision);
    }

    const updatedAt = new Date(set.updatedAt || 0).getTime();
    return Number.isFinite(updatedAt) && updatedAt > 0 ? updatedAt : 1;
};

export const buildContentManifest = (topicRows = []) => {
    let contentRevision = 1;

    const topics = topicRows.map(({ topicId, sets = [] }) => {
        let topicRevision = 1;
        const activeSetIds = [];
        const setRevisions = {};

        for (const set of sets) {
            const revision = getSetContentRevision(set);
            topicRevision = Math.max(topicRevision, revision);
            contentRevision = Math.max(contentRevision, revision);
            setRevisions[String(set.setId)] = revision;
            if (set.isActive !== false) activeSetIds.push(String(set.setId));
        }

        return {
            topicId,
            revision: topicRevision,
            activeSetIds,
            setRevisions,
        };
    });

    return {
        schemaVersion: 1,
        contentRevision,
        topics,
    };
};
